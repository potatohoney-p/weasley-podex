import { watch, type FSWatcher } from 'node:fs';
import { existsSync } from 'node:fs';

export type WatcherEventListener = (event: WatcherEvent) => void;

export type WatcherEvent =
    | { type: 'file-changed'; path: string }
    | { type: 'tree-changed' };

export type NotesWatcher = {
    version: () => number;
    close: () => void;
    onEvent: (listener: WatcherEventListener) => void;
};

const RESERVED_DIRS = new Set(['.assets', '_templates', '_snippets', '_plugins', '.git']);

export function createNotesWatcher(rootPath: string): NotesWatcher {
    let version = 0;
    let watcher: FSWatcher | null = null;
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    const listeners: WatcherEventListener[] = [];
    const pendingChanges = new Map<string, ReturnType<typeof setTimeout>>();

    function emit(event: WatcherEvent): void {
        for (const listener of listeners) {
            try { listener(event); } catch { /* ignore */ }
        }
    }

    function handleChange(_eventType: string, filename: string | null): void {
        if (!filename) return;
        const topDir = filename.split('/')[0] ?? '';
        if (topDir.startsWith('.') && topDir !== '.') return;
        if (RESERVED_DIRS.has(topDir)) return;

        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            version++;
            emit({ type: 'tree-changed' });
        }, 200);

        const isMd = filename.endsWith('.md');
        if (!isMd) return;

        const existing = pendingChanges.get(filename);
        if (existing) clearTimeout(existing);
        pendingChanges.set(filename, setTimeout(() => {
            pendingChanges.delete(filename);
            emit({ type: 'file-changed', path: filename });
        }, 500));
    }

    if (existsSync(rootPath)) {
        try {
            watcher = watch(rootPath, { recursive: true }, handleChange);
            watcher.on('error', () => {});
        } catch {
            // fs.watch may fail on some systems; version stays at 0
        }
    }

    return {
        version: () => version,
        close: () => {
            clearTimeout(debounceTimer);
            for (const timer of pendingChanges.values()) clearTimeout(timer);
            pendingChanges.clear();
            watcher?.close();
        },
        onEvent: (listener) => { listeners.push(listener); },
    };
}
