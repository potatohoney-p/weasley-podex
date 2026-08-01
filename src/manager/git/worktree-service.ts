import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { isWithinHome } from './git-guards.js';
import { runGit } from './git-runner.js';

export type GitWorktreeEntry = {
    path: string;
    head: string | null;
    branch: string | null;
    bare: boolean;
    detached: boolean;
    prunable: boolean;
    locked: boolean;
    reason: string | null;
    current: boolean;
};

function realOrResolved(path: string): string {
    try {
        return realpathSync(path);
    } catch {
        return resolve(path);
    }
}

function branchName(raw: string): string {
    return raw.startsWith('refs/heads/') ? raw.slice('refs/heads/'.length) : raw;
}

export function parseGitWorktreePorcelain(repoRoot: string, output: string): GitWorktreeEntry[] {
    const currentRoot = realOrResolved(repoRoot);
    const entries: GitWorktreeEntry[] = [];
    const blocks = output.split(/\n\s*\n/).map(block => block.trim()).filter(Boolean);
    for (const block of blocks) {
        const entry: GitWorktreeEntry = {
            path: '',
            head: null,
            branch: null,
            bare: false,
            detached: false,
            prunable: false,
            locked: false,
            reason: null,
            current: false,
        };
        for (const line of block.split('\n')) {
            if (line.startsWith('worktree ')) entry.path = resolve(line.slice('worktree '.length).trim());
            else if (line.startsWith('HEAD ')) entry.head = line.slice('HEAD '.length).trim() || null;
            else if (line.startsWith('branch ')) entry.branch = branchName(line.slice('branch '.length).trim());
            else if (line === 'bare') entry.bare = true;
            else if (line === 'detached') entry.detached = true;
            else if (line === 'locked') entry.locked = true;
            else if (line.startsWith('locked ')) {
                entry.locked = true;
                entry.reason = line.slice('locked '.length).trim() || null;
            } else if (line === 'prunable') entry.prunable = true;
            else if (line.startsWith('prunable ')) {
                entry.prunable = true;
                entry.reason = line.slice('prunable '.length).trim() || null;
            }
        }
        if (!entry.path || !isWithinHome(entry.path)) continue;
        entry.current = realOrResolved(entry.path) === currentRoot;
        entries.push(entry);
    }
    return entries;
}

export async function getGitWorktrees(repoRoot: string): Promise<GitWorktreeEntry[]> {
    if (!isWithinHome(repoRoot)) throw new Error('path not allowed');
    const output = await runGit(['worktree', 'list', '--porcelain'], repoRoot);
    return parseGitWorktreePorcelain(repoRoot, output);
}
