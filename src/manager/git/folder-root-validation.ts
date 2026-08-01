import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertExistingHomePath, isWithinHome } from './git-guards.js';
import { runGit } from './git-runner.js';

export type FolderGitRoot = {
    folderPanelRoot: string;
    repoRoot: string;
};

function realOrResolved(path: string): string {
    try {
        return realpathSync(path);
    } catch {
        return resolve(path);
    }
}

export async function resolveFolderGitRoot(folderPanelRoot: string, requestedRepoRoot?: string): Promise<FolderGitRoot> {
    if (!folderPanelRoot.trim()) throw new Error('folder root required');
    const resolvedFolderRoot = assertExistingHomePath(folderPanelRoot, 'folder root');
    let repoRoot: string;
    try {
        repoRoot = (await runGit(['rev-parse', '--show-toplevel'], resolvedFolderRoot)).trim();
    } catch {
        throw new Error('not a git repository');
    }
    if (!repoRoot || !isWithinHome(repoRoot)) throw new Error('repo root is outside home');
    const normalizedRepoRoot = realOrResolved(repoRoot);
    if (requestedRepoRoot?.trim()) {
        const requested = assertExistingHomePath(requestedRepoRoot, 'requested repo root');
        if (realOrResolved(requested) !== normalizedRepoRoot) throw new Error('repo root mismatch');
    }
    return { folderPanelRoot: resolvedFolderRoot, repoRoot: normalizedRepoRoot };
}
