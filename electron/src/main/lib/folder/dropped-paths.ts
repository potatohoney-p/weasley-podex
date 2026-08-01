import { lstat } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { isWithinHome } from '../path-security.js';

export type DroppedPathEntry = {
    name: string;
    path: string;
    kind: 'file' | 'directory';
};

export type DroppedPathRejected = {
    path: string;
    reason: string;
};

export type DroppedPathResolveResult = {
    entries: DroppedPathEntry[];
    rejected: DroppedPathRejected[];
};

type ResolveDroppedPathsOptions = {
    allowPath?: ((path: string) => boolean) | undefined;
    addRoot?: ((root: string) => void) | undefined;
};

export async function resolveDroppedPaths(
    rawPaths: string[],
    options: ResolveDroppedPathsOptions = {},
): Promise<DroppedPathResolveResult> {
    const allowPath = options.allowPath ?? isWithinHome;
    const seen = new Set<string>();
    const entries: DroppedPathEntry[] = [];
    const rejected: DroppedPathRejected[] = [];

    for (const rawPath of rawPaths) {
        const raw = typeof rawPath === 'string' ? rawPath.trim() : '';
        if (!raw) continue;
        const resolved = resolve(raw);
        if (seen.has(resolved)) continue;
        seen.add(resolved);

        if (!allowPath(resolved)) {
            rejected.push({ path: resolved, reason: 'path not allowed' });
            continue;
        }

        try {
            const s = await lstat(resolved);
            if (s.isSymbolicLink()) {
                rejected.push({ path: resolved, reason: 'symlinks not allowed' });
                continue;
            }
            if (s.isDirectory()) {
                options.addRoot?.(resolved);
                entries.push({ path: resolved, name: basename(resolved), kind: 'directory' });
                continue;
            }
            if (s.isFile()) {
                options.addRoot?.(dirname(resolved));
                entries.push({ path: resolved, name: basename(resolved), kind: 'file' });
                continue;
            }
            rejected.push({ path: resolved, reason: 'unsupported path kind' });
        } catch {
            rejected.push({ path: resolved, reason: 'path not accessible' });
        }
    }

    return { entries, rejected };
}
