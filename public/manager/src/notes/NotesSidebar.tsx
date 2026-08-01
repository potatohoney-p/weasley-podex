import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { createNoteFile, createNoteFolder, fetchNoteTemplate, fetchNoteTemplates, renameNotePath, trashNotePath } from './notes-api';
import { applyTemplate } from './template-engine';
import { NewFolderIcon, NewNoteIcon, NotesFileTree, RefreshIcon } from './NotesFileTree';
import { NotesSearchSidebar } from './NotesSearchSidebar';
import { useRegisterNoteCommands, type NoteCommand } from './notes-command-registry';
import { publishInvalidation } from '../sync/invalidation-bus';
import { DashboardApiError, type NoteTemplate } from '../api';
import type { NotesTreeEntry } from './notes-types';
export type NotesSidebarMode = 'files' | 'search';
type NotesSidebarProps = {
    tree: NotesTreeEntry[];
    loading: boolean;
    error: string | null;
    notesRoot: string | null;
    selectedPath: string | null;
    dirtyPath: string | null;
    highlightedPath?: string | null;
    externalFocusPath?: string | null;
    treeWidth: number;
    mode: NotesSidebarMode;
    searchFocusToken: number;
    tagFilter: string | null;
    selectedHiddenByFilter: boolean;
    onModeChange: (mode: NotesSidebarMode) => void;
    onOpenSearch: () => void;
    onSelectedPathChange: (path: string | null) => void;
    onRefreshTree: (selectPath?: string | null) => Promise<void>;
    onClearTagFilter: () => void;
};

function movePathToFolder(path: string, folderPath: string | null): string {
    const parts = path.split('/').filter(Boolean);
    const name = parts[parts.length - 1];
    if (!name) return path;
    return folderPath ? `${folderPath}/${name}` : name;
}

function pathName(path: string): string {
    const parts = path.split('/').filter(Boolean);
    return parts[parts.length - 1] || path;
}

function pathParent(path: string): string | null {
    const parts = path.split('/').filter(Boolean);
    if (parts.length <= 1) return null;
    return parts.slice(0, -1).join('/');
}

function renameTarget(path: string, value: string, kind: NotesTreeEntry['kind']): string {
    const nextName = kind === 'file' && !value.endsWith('.md') ? `${value}.md` : value;
    if (nextName.includes('/')) return nextName;
    const parent = pathParent(path);
    return parent ? `${parent}/${nextName}` : nextName;
}

function rebasePath(path: string | null, from: string, to: string): string | null {
    if (!path) return null;
    if (path === from) return to;
    return path.startsWith(`${from}/`) ? `${to}/${path.slice(from.length + 1)}` : path;
}

function pathContains(parent: string, child: string | null): boolean {
    if (!child) return false;
    return child === parent || child.startsWith(`${parent}/`);
}

function isDirtyTarget(path: string, kind: NotesTreeEntry['kind'], dirtyPath: string | null): boolean {
    if (!dirtyPath) return false;
    return kind === 'folder' ? pathContains(path, dirtyPath) : dirtyPath === path;
}

function trashConfirmMessage(path: string, kind: NotesTreeEntry['kind'], dirty: boolean): string {
    const label = kind === 'folder'
        ? `Move folder "${path}" and all child notes to trash?`
        : `Move note "${path}" to trash?`;
    return dirty ? `${label}\n\nThere are unsaved changes inside this target.` : label;
}

function batchTrashConfirmMessage(items: { path: string; kind: NotesTreeEntry['kind'] }[], dirty: boolean): string {
    const fileCount = items.filter(it => it.kind === 'file').length;
    const folderCount = items.length - fileCount;
    const parts: string[] = [];
    if (folderCount > 0) parts.push(`${folderCount} folder${folderCount === 1 ? '' : 's'}`);
    if (fileCount > 0) parts.push(`${fileCount} note${fileCount === 1 ? '' : 's'}`);
    const subject = parts.length > 0 ? parts.join(' + ') : `${items.length} items`;
    const label = `Move ${subject} to trash?`;
    return dirty ? `${label}\n\nThere are unsaved changes inside this selection.` : label;
}

function SearchIcon() {
    return (
        <svg viewBox="0 0 18 18" aria-hidden="true" className="notes-tree-action-icon">
            <path d="M7.8 3.2a4.6 4.6 0 1 1 0 9.2 4.6 4.6 0 0 1 0-9.2Z" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="m11.3 11.3 3.2 3.2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
    );
}

function hasFile(entries: NotesTreeEntry[], name: string): boolean {
    return entries.some(e => e.kind === 'file' && e.name === name);
}

export function NotesSidebar(props: NotesSidebarProps) {
    const style = { '--notes-tree-width': `${props.treeWidth}px` } as CSSProperties;
    const [error, setError] = useState<string | null>(null);
    const [status, setStatus] = useState<string | null>(null);
    const [selectedFolderPath, setSelectedFolderPath] = useState<string | null>(null);
    const [templates, setTemplates] = useState<NoteTemplate[]>([]);
    const [templatesLoaded, setTemplatesLoaded] = useState<'pending' | 'ok' | 'error'>('pending');
    const [pendingNewNote, setPendingNewNote] = useState<string | null>(null);

    useEffect(() => {
        void fetchNoteTemplates()
            .then(t => { setTemplates(t); setTemplatesLoaded('ok'); })
            .catch(() => { setTemplatesLoaded('error'); });
    }, []);

    async function openToday(): Promise<void> {
        const now = new Date();
        const pad = (n: number) => String(n).padStart(2, '0');
        const todayName = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.md`;
        if (hasFile(props.tree, todayName)) {
            props.onSelectedPathChange(todayName);
            setError(null);
            return;
        }
        if (templatesLoaded === 'pending') {
            setError('Templates are still loading. Please try again.');
            return;
        }
        if (templatesLoaded === 'error') {
            setError('Template list failed to load. Cannot determine daily template.');
            return;
        }
        try {
            setStatus(null);
            setError(null);
            const dailyTemplate = templates.find(t => t.name === 'daily');
            let content = '';
            if (dailyTemplate) {
                try {
                    const tmpl = await fetchNoteTemplate(dailyTemplate.name);
                    content = applyTemplate(tmpl.content, { title: todayName.replace(/\.md$/, '') });
                } catch {
                    setError('Daily template failed to load. Note was not created.');
                    return;
                }
            }
            const created = await createNoteFile(todayName, content);
            props.onSelectedPathChange(created.path);
            await props.onRefreshTree(created.path);
            publishInvalidation({ topics: ['notes'], reason: 'note:created', source: 'ui', sourceId: 'notes-sidebar' });
        } catch (err) {
            if (err instanceof DashboardApiError && err.status === 409 && err.code === 'note_path_exists') {
                setError(null);
                props.onSelectedPathChange(todayName);
                await props.onRefreshTree(todayName);
                return;
            }
            setError((err as Error).message);
        }
    }

    async function createNote(): Promise<void> {
        if (templatesLoaded === 'pending') {
            setError('Templates are still loading. Please try again.');
            return;
        }
        if (templatesLoaded === 'error') {
            setError('Template list failed to load. Cannot offer template picker.');
            return;
        }
        const fallback = selectedFolderPath ? `${selectedFolderPath}/untitled.md` : 'untitled.md';
        const name = window.prompt('Note path', fallback);
        if (!name) return;
        const notePath = name.endsWith('.md') ? name : `${name}.md`;
        if (templates.length > 0) {
            setPendingNewNote(notePath);
            return;
        }
        await finishCreateNote(notePath, null);
    }

    async function finishCreateNote(notePath: string, templateName: string | null): Promise<void> {
        setPendingNewNote(null);
        let content = '';
        if (templateName) {
            try {
                const tmpl = await fetchNoteTemplate(templateName);
                const title = (notePath.endsWith('.md') ? notePath.slice(0, -3) : notePath).split('/').pop() ?? '';
                content = applyTemplate(tmpl.content, { title });
            } catch {
                setError(`Template "${templateName}" failed to load. Note was not created.`);
                return;
            }
        }
        try {
            setStatus(null);
            setError(null);
            const created = await createNoteFile(notePath, content);
            props.onSelectedPathChange(created.path);
            await props.onRefreshTree(created.path);
            publishInvalidation({ topics: ['notes'], reason: 'note:created', source: 'ui', sourceId: 'notes-sidebar' });
        } catch (err) {
            setError((err as Error).message);
        }
    }

    useEffect(() => {
        function handleCreateNoteShortcut(event: KeyboardEvent): void {
            if (!event.altKey || event.metaKey || event.ctrlKey || event.shiftKey || event.key.toLowerCase() !== 'n') return;
            event.preventDefault();
            void createNote();
        }

        window.addEventListener('keydown', handleCreateNoteShortcut);
        return () => window.removeEventListener('keydown', handleCreateNoteShortcut);
    });

    async function createFolder(): Promise<void> {
        const fallback = selectedFolderPath ? `${selectedFolderPath}/new-folder` : 'new-folder';
        const name = window.prompt('Folder path', fallback);
        if (!name) return;
        try {
            setStatus(null);
            const created = await createNoteFolder(name);
            setSelectedFolderPath(created.path);
            await props.onRefreshTree();
            publishInvalidation({ topics: ['notes'], reason: 'folder:created', source: 'ui', sourceId: 'notes-sidebar' });
        } catch (err) {
            setError((err as Error).message);
        }
    }

    async function movePath(from: string, toFolder: string | null): Promise<void> {
        const to = movePathToFolder(from, toFolder);
        if (from === to) return;
        try {
            setStatus(null);
            const moved = await renameNotePath(from, to);
            if (props.selectedPath === from) props.onSelectedPathChange(moved.to);
            await props.onRefreshTree(moved.to);
            publishInvalidation({ topics: ['notes'], reason: 'note:moved', source: 'ui', sourceId: 'notes-sidebar' });
        } catch (err) {
            setError((err as Error).message);
        }
    }

    async function renamePath(path: string, kind: NotesTreeEntry['kind']): Promise<void> {
        const label = kind === 'folder' ? 'Rename folder' : 'Rename note';
        const nextPath = window.prompt(label, pathName(path));
        if (!nextPath) return;
        const target = renameTarget(path, nextPath, kind);
        if (target === path) return;
        try {
            setStatus(null);
            const renamed = await renameNotePath(path, target);
            const nextSelectedPath = rebasePath(props.selectedPath, renamed.from, renamed.to);
            const nextSelectedFolderPath = rebasePath(selectedFolderPath, renamed.from, renamed.to);
            if (nextSelectedFolderPath !== selectedFolderPath) setSelectedFolderPath(nextSelectedFolderPath);
            if (nextSelectedPath !== props.selectedPath) props.onSelectedPathChange(nextSelectedPath);
            await props.onRefreshTree(nextSelectedPath);
            publishInvalidation({ topics: ['notes'], reason: 'note:renamed', source: 'ui', sourceId: 'notes-sidebar' });
        } catch (err) {
            setError((err as Error).message);
        }
    }

    async function trashPaths(items: { path: string; kind: NotesTreeEntry['kind'] }[]): Promise<void> {
        if (items.length === 0) return;
        if (items.length === 1) {
            await trashPath(items[0].path, items[0].kind);
            return;
        }
        const dirtyHit = items.some(item => isDirtyTarget(item.path, item.kind, props.dirtyPath));
        if (!window.confirm(batchTrashConfirmMessage(items, dirtyHit))) return;

        setStatus(null);
        let succeeded = 0;
        let selectedCleared = false;
        let folderCleared = false;
        let firstError: string | null = null;

        for (const item of items) {
            try {
                await trashNotePath(item.path, item.kind);
                succeeded += 1;
                if (!selectedCleared) {
                    const selectedHit = item.kind === 'folder'
                        ? pathContains(item.path, props.selectedPath)
                        : props.selectedPath === item.path;
                    if (selectedHit) selectedCleared = true;
                }
                if (!folderCleared && item.kind === 'folder' && pathContains(item.path, selectedFolderPath)) {
                    folderCleared = true;
                }
            } catch (err) {
                firstError = `Failed at ${item.path}: ${(err as Error).message}`;
                break;
            }
        }

        if (selectedCleared) props.onSelectedPathChange(null);
        if (folderCleared) setSelectedFolderPath(null);

        if (firstError) {
            setError(firstError);
            setStatus(succeeded > 0 ? `Moved ${succeeded} of ${items.length} to trash before stopping.` : null);
        } else {
            setStatus(`Moved ${succeeded} item${succeeded === 1 ? '' : 's'} to trash.`);
        }

        await props.onRefreshTree(selectedCleared ? null : props.selectedPath);
        publishInvalidation({ topics: ['notes'], reason: 'notes:batch-trashed', source: 'ui', sourceId: 'notes-sidebar' });
    }

    async function trashPath(path: string, kind: NotesTreeEntry['kind']): Promise<void> {
        const dirty = isDirtyTarget(path, kind, props.dirtyPath);
        if (!window.confirm(trashConfirmMessage(path, kind, dirty))) return;
        try {
            setStatus(null);
            const result = await trashNotePath(path, kind);
            const selectedWasInside = kind === 'folder'
                ? pathContains(path, props.selectedPath)
                : props.selectedPath === path;
            const folderWasInside = kind === 'folder'
                ? pathContains(path, selectedFolderPath)
                : false;

            if (selectedWasInside) props.onSelectedPathChange(null);
            if (folderWasInside) setSelectedFolderPath(null);

            const destination = result.deletedTo === 'os-trash' ? 'OS trash' : 'dashboard trash';
            const restoreHint = result.deletedTo === 'dashboard-trash' && result.restoreHint
                ? ` Restore from: ${result.restoreHint}`
                : '';
            setStatus(`Moved ${result.path} to ${destination}.${restoreHint}`);
            await props.onRefreshTree(selectedWasInside ? null : props.selectedPath);
            publishInvalidation({ topics: ['notes'], reason: 'note:trashed', source: 'ui', sourceId: 'notes-sidebar' });
        } catch (err) {
            setError((err as Error).message);
        }
    }

    const templateDisabledReason = templatesLoaded === 'pending'
        ? 'Templates are still loading'
        : templatesLoaded === 'error'
            ? 'Templates failed to load'
            : undefined;
    const sidebarCommands = useMemo<NoteCommand[]>(() => [
        {
            id: 'sidebar:new-note',
            section: 'Create',
            label: 'New note',
            shortcut: 'Alt+N',
            keywords: ['create', 'file'],
            disabled: templatesLoaded !== 'ok',
            disabledReason: templateDisabledReason,
            run: () => void createNote(),
        },
        {
            id: 'sidebar:new-folder',
            section: 'Create',
            label: 'New folder',
            keywords: ['directory'],
            run: () => void createFolder(),
        },
        {
            id: 'sidebar:today',
            section: 'Create',
            label: 'Open today',
            keywords: ['daily', 'journal'],
            disabled: templatesLoaded !== 'ok',
            disabledReason: templateDisabledReason,
            run: () => void openToday(),
        },
        {
            id: 'sidebar:search',
            section: 'Navigate',
            label: 'Search notes',
            shortcut: 'Cmd+Shift+F',
            run: props.onOpenSearch,
        },
        {
            id: 'sidebar:refresh',
            section: 'File',
            label: 'Refresh notes',
            disabled: props.loading,
            disabledReason: 'Refresh already running',
            run: () => void props.onRefreshTree(),
        },
        {
            id: 'sidebar:clear-tag-filter',
            section: 'Navigate',
            label: 'Clear tag filter',
            disabled: !props.tagFilter,
            disabledReason: 'No active tag filter',
            run: props.onClearTagFilter,
        },
    ], [
        props.loading,
        props.onClearTagFilter,
        props.onOpenSearch,
        props.onRefreshTree,
        props.onSelectedPathChange,
        props.selectedPath,
        props.tagFilter,
        props.tree,
        selectedFolderPath,
        templateDisabledReason,
        templates,
        templatesLoaded,
    ]);
    useRegisterNoteCommands(sidebarCommands);

    return (
        <aside className="notes-tree" style={style}>
            {(props.error || error) && <section className="state error-state">{props.error || error}</section>}
            {status && <section className="state notes-status-state">{status}</section>}
            <div className="notes-tree-header">
                <strong>Notes</strong>
                <div className="notes-tree-actions">
                    <button
                        type="button"
                        className={props.mode === 'search' ? 'is-active' : ''}
                        onClick={() => {
                            if (props.mode === 'search') props.onModeChange('files');
                            else props.onOpenSearch();
                        }}
                        title="Search notes"
                        aria-label="Search notes"
                        aria-pressed={props.mode === 'search'}
                    >
                        <SearchIcon />
                    </button>
                    <button type="button" onClick={() => void createNote()} title="New note" aria-label="New note"><NewNoteIcon /></button>
                    <button type="button" onClick={() => void createFolder()} title="New folder" aria-label="New folder"><NewFolderIcon /></button>
                    <button type="button" onClick={() => void props.onRefreshTree()} disabled={props.loading} title="Refresh notes" aria-label="Refresh notes"><RefreshIcon /></button>
                </div>
            </div>
            {props.mode === 'files' ? (
                <>
                    {props.tagFilter && (
                        <div className="notes-tag-filter-banner" role="status">
                            <span className="notes-tag-filter-banner-meta">
                                <span>Tag: #{props.tagFilter}</span>
                                {props.selectedHiddenByFilter && (
                                    <span className="notes-tag-filter-banner-hint">Selected note hidden by filter</span>
                                )}
                            </span>
                            <button
                                type="button"
                                className="notes-tag-filter-clear"
                                onClick={props.onClearTagFilter}
                            >
                                Clear
                            </button>
                        </div>
                    )}
                    {pendingNewNote && (
                        <div className="notes-template-picker">
                            <div className="notes-template-picker-label">Template for {pathName(pendingNewNote)}</div>
                            <div className="notes-template-picker-options">
                                <button type="button" className="notes-template-picker-option" onClick={() => void finishCreateNote(pendingNewNote, null)}>Blank</button>
                                {templates.map(t => (
                                    <button key={t.name} type="button" className="notes-template-picker-option" onClick={() => void finishCreateNote(pendingNewNote, t.name)}>{t.name}</button>
                                ))}
                            </div>
                            <button type="button" className="notes-template-picker-cancel" onClick={() => setPendingNewNote(null)}>Cancel</button>
                        </div>
                    )}
                    <div className="notes-today-bar">
                        <button type="button" className="notes-today-button" onClick={() => void openToday()}>
                            Today
                        </button>
                    </div>
                    <NotesFileTree
                        entries={props.tree}
                        selectedPath={props.selectedPath}
                        selectedFolderPath={selectedFolderPath}
                        dirtyPath={props.dirtyPath}
                        highlightedPath={props.highlightedPath ?? null}
                        externalFocusPath={props.externalFocusPath ?? null}
                        loading={props.loading}
                        notesRoot={props.notesRoot}
                        onSelectPath={props.onSelectedPathChange}
                        onSelectFolder={setSelectedFolderPath}
                        onMovePath={(from, toFolder) => void movePath(from, toFolder)}
                        onRenamePath={(path, kind) => void renamePath(path, kind)}
                        onTrashPath={(path, kind) => void trashPath(path, kind)}
                        onTrashPaths={items => void trashPaths(items)}
                    />
                </>
            ) : (
                <NotesSearchSidebar
                    focusToken={props.searchFocusToken}
                    onSelect={props.onSelectedPathChange}
                    onModeChange={props.onModeChange}
                />
            )}
        </aside>
    );
}
