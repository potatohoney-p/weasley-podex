import { useCallback, useEffect } from 'react';
import { getDesktop, isElectron, type DroppedPathEntry } from '../panels/desktop-bridge';

export type ElectronDroppedPathsSource = 'manager' | 'preview';

export type ElectronDroppedPathsEvent = {
    source: ElectronDroppedPathsSource;
    entries: DroppedPathEntry[];
    rejected?: Array<{ path: string; reason: string }> | undefined;
    error?: string | undefined;
};

type UseElectronDroppedPathsOptions = {
    onDroppedPaths: (event: ElectronDroppedPathsEvent) => void;
};

type ClosestTarget = {
    closest: (selector: string) => Element | null;
};

export function isPreviewDropTarget(target: EventTarget | null): boolean {
    const maybeElement = target as Partial<ClosestTarget> | null;
    if (typeof maybeElement?.closest !== 'function') return false;
    return Boolean(maybeElement.closest('.preview-panel, .preview-frame'));
}

export function shouldConsumeManagerDrop(target: EventTarget | null): boolean {
    return !isPreviewDropTarget(target);
}

export function firstDirectory(entries: DroppedPathEntry[]): DroppedPathEntry | null {
    return entries.find(entry => entry.kind === 'directory') ?? null;
}

export function firstFile(entries: DroppedPathEntry[]): DroppedPathEntry | null {
    return entries.find(entry => entry.kind === 'file') ?? null;
}

export function describeDroppedPathsEvent(event: ElectronDroppedPathsEvent): string | null {
    const rejectedCount = event.rejected?.length ?? 0;
    const suffix = rejectedCount > 0 ? ` ${rejectedCount} rejected.` : '';
    if (event.entries.length === 0) {
        if (event.error) return `Drop failed: ${event.error}`;
        if (rejectedCount > 0) return `Drop rejected: ${event.rejected?.[0]?.reason ?? 'path not allowed'}`;
        return null;
    }
    if (event.source === 'preview') {
        return `Captured ${event.entries.length} dropped item${event.entries.length === 1 ? '' : 's'} from preview.${suffix}`;
    }
    const directory = firstDirectory(event.entries);
    if (directory) return `Opened dropped folder: ${directory.name}.${suffix}`;
    const file = firstFile(event.entries);
    if (file) return `Opened dropped file: ${file.name}.${suffix}`;
    return `Opened ${event.entries.length} dropped item${event.entries.length === 1 ? '' : 's'}.${suffix}`;
}

function hasFileTransfer(dataTransfer: DataTransfer | null): boolean {
    if (!dataTransfer) return false;
    if (dataTransfer.files.length > 0) return true;
    return Array.from(dataTransfer.types).includes('Files');
}

export function useElectronDroppedPaths(options: UseElectronDroppedPathsOptions): {
    resolveDroppedFiles: (files: File[], source: ElectronDroppedPathsSource) => Promise<DroppedPathEntry[]>;
} {
    const { onDroppedPaths } = options;
    const resolveDroppedFiles = useCallback(async (files: File[], source: ElectronDroppedPathsSource): Promise<DroppedPathEntry[]> => {
        const bridge = getDesktop()?.dragDrop;
        if (!bridge || files.length === 0) return [];
        try {
            const result = await bridge.resolveDroppedItems(files);
            const entries = result.entries ?? [];
            const rejected = result.rejected ?? [];
            if (entries.length > 0 || rejected.length > 0 || result.error) {
                onDroppedPaths({
                    source,
                    entries,
                    ...(rejected.length > 0 ? { rejected } : {}),
                    ...(result.error ? { error: result.error } : {}),
                });
            }
            return entries;
        } catch (error) {
            console.warn('[electron-drop] failed to resolve dropped files', error);
            onDroppedPaths({ source, entries: [], error: (error as Error).message });
            return [];
        }
    }, [onDroppedPaths]);

    useEffect(() => {
        if (!isElectron() || !getDesktop()?.dragDrop) return undefined;

        function onDragOver(event: DragEvent): void {
            const dataTransfer = event.dataTransfer;
            if (!dataTransfer || !hasFileTransfer(dataTransfer)) return;
            if (!shouldConsumeManagerDrop(event.target)) return;
            event.preventDefault();
            dataTransfer.dropEffect = 'copy';
        }

        function onDrop(event: DragEvent): void {
            const files = event.dataTransfer?.files ? Array.from(event.dataTransfer.files) : [];
            if (files.length === 0) return;
            if (!shouldConsumeManagerDrop(event.target)) return;
            event.preventDefault();
            event.stopPropagation();
            void resolveDroppedFiles(files, 'manager');
        }

        document.addEventListener('dragover', onDragOver, true);
        document.addEventListener('drop', onDrop, true);
        return () => {
            document.removeEventListener('dragover', onDragOver, true);
            document.removeEventListener('drop', onDrop, true);
        };
    }, [resolveDroppedFiles]);

    return { resolveDroppedFiles };
}
