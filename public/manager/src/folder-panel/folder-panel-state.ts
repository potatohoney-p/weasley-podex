import type { FolderPanelEntry } from './folder-panel-types';

export function parentPath(path: string): string {
    const idx = path.lastIndexOf('/');
    return idx > 0 ? path.slice(0, idx) : '/';
}

export function isDescendantPath(parent: string, child: string): boolean {
    return child === parent || child.startsWith(`${parent}/`);
}

export function relativeFolderPath(root: string | null, path: string): string {
    if (!root) return path;
    const base = root.endsWith('/') ? root : `${root}/`;
    return path.startsWith(base) ? path.slice(base.length) : path;
}

export function dropCachedBranches(
    cache: Map<string, FolderPanelEntry[]>,
    paths: string[],
): Map<string, FolderPanelEntry[]> {
    const next = new Map(cache);
    for (const path of paths) next.delete(path);
    return next;
}
