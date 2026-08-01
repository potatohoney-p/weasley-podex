import { lstat, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, resolve, sep } from 'node:path';
import { assertExistingHomePath, isWithinHome } from './git-guards.js';
import { resolveFolderGitRoot } from './folder-root-validation.js';
import { runGit } from './git-runner.js';
import { getGitStatusMap } from './status-service.js';
import { getGitWorktrees, type GitWorktreeEntry } from './worktree-service.js';

export type GitWorktreeOperation =
    | { type: 'worktree-add'; path: string; branch: string; createBranch: boolean }
    | { type: 'worktree-remove'; path: string; force: boolean }
    | { type: 'worktree-prune' };

export type GitWorktreeOperationPreview = {
    command: string[];
    label: string;
    destructive: boolean;
    requiresConfirmation: true;
};

export type GitWorktreeOperationResult = {
    repoRoot: string;
    preview: GitWorktreeOperationPreview;
    stdout: string;
    worktrees: GitWorktreeEntry[];
};

type PreviewContextInput = {
    folderPanelRoot: string;
    repoRoot?: string | undefined;
    operation: GitWorktreeOperation;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function shortPath(path: string): string {
    return path.split('/').filter(Boolean).pop() || path;
}

function isValidWorktreeRef(value: string): boolean {
    if (!value || value.startsWith('-')) return false;
    if (value.includes('..') || value.includes('@{') || value.includes('\\')) return false;
    if (value.startsWith('/') || value.endsWith('/') || value.endsWith('.lock')) return false;
    return /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value);
}

async function tryLstat(path: string) {
    try {
        return await lstat(path);
    } catch {
        return null;
    }
}

function resolvedHome(): string {
    return resolve(homedir());
}

function assertAbsoluteHomeCandidate(path: string): string {
    if (!path.trim()) throw new Error('worktree path required');
    if (!isAbsolute(path)) throw new Error('worktree path must be absolute');
    const target = resolve(path);
    const home = resolvedHome();
    if (target !== home && !target.startsWith(home + sep)) throw new Error('worktree path is outside home');
    return target;
}

async function realOrResolved(path: string): Promise<string> {
    try {
        return await realpath(path);
    } catch {
        return resolve(path);
    }
}

export function readGitWorktreeOperation(raw: unknown): GitWorktreeOperation {
    if (!isRecord(raw)) throw new Error('operation required');
    const type = raw['type'];
    if (type === 'worktree-prune') return { type };
    if (type === 'worktree-add') {
        const path = raw['path'];
        const branch = raw['branch'];
        const createBranch = raw['createBranch'];
        if (typeof path !== 'string' || !path.trim()) throw new Error('worktree path required');
        if (typeof branch !== 'string' || !branch.trim()) throw new Error('worktree branch required');
        if (typeof createBranch !== 'boolean') throw new Error('createBranch must be boolean');
        if (!isValidWorktreeRef(branch.trim())) throw new Error('invalid worktree branch');
        return { type, path: path.trim(), branch: branch.trim(), createBranch };
    }
    if (type === 'worktree-remove') {
        const path = raw['path'];
        const force = raw['force'];
        if (typeof path !== 'string' || !path.trim()) throw new Error('worktree path required');
        if (typeof force !== 'boolean') throw new Error('force must be boolean');
        return { type, path: path.trim(), force };
    }
    throw new Error('unknown worktree operation');
}

export async function validateNewWorktreePathInsideHome(targetPath: string, blockedRoots: string[]): Promise<string> {
    const target = assertAbsoluteHomeCandidate(targetPath);
    const targetStat = await tryLstat(target);
    if (targetStat?.isSymbolicLink()) throw new Error('worktree path symlinks are not allowed');

    const ancestors: string[] = [];
    let current = targetStat ? target : dirname(target);
    const home = resolvedHome();
    while (current && current !== dirname(current)) {
        if (current === home || current.startsWith(home + sep)) ancestors.push(current);
        const stat = await tryLstat(current);
        if (stat) break;
        current = dirname(current);
    }
    if (ancestors.length === 0) throw new Error('worktree parent is outside home');
    const nearestParent = ancestors[ancestors.length - 1] ?? home;
    for (const ancestor of ancestors.reverse()) {
        const stat = await tryLstat(ancestor);
        if (stat?.isSymbolicLink()) throw new Error('worktree parent symlinks are not allowed');
    }
    const realParent = await realOrResolved(nearestParent);
    if (!isWithinHome(realParent)) throw new Error('worktree parent is outside home');

    const comparableTarget = targetStat ? await realOrResolved(target) : target;
    const blocked = await Promise.all(blockedRoots.map(root => realOrResolved(root)));
    if (blocked.includes(comparableTarget)) throw new Error('worktree path must differ from the current repo');
    return target;
}

export function previewGitWorktreeOperation(operation: GitWorktreeOperation): GitWorktreeOperationPreview {
    if (operation.type === 'worktree-add') {
        const args = operation.createBranch
            ? ['git', 'worktree', 'add', '-b', operation.branch, operation.path]
            : ['git', 'worktree', 'add', operation.path, operation.branch];
        return {
            command: args,
            label: `Add worktree ${shortPath(operation.path)}`,
            destructive: false,
            requiresConfirmation: true,
        };
    }
    if (operation.type === 'worktree-remove') {
        return {
            command: ['git', 'worktree', 'remove', ...(operation.force ? ['--force'] : []), operation.path],
            label: `Remove worktree ${shortPath(operation.path)}`,
            destructive: true,
            requiresConfirmation: true,
        };
    }
    return {
        command: ['git', 'worktree', 'prune'],
        label: 'Prune stale worktrees',
        destructive: true,
        requiresConfirmation: true,
    };
}

async function requireKnownWorktree(repoRoot: string, path: string): Promise<string> {
    const target = assertExistingHomePath(path, 'worktree path');
    const targetReal = await realOrResolved(target);
    const worktrees = await getGitWorktrees(repoRoot);
    const known = await Promise.all(worktrees.map(async entry => realOrResolved(entry.path)));
    if (!known.includes(targetReal)) throw new Error('worktree path is not registered for this repo');
    return targetReal;
}

export async function validateGitWorktreeOperationPreviewContext(input: PreviewContextInput): Promise<GitWorktreeOperationPreview> {
    const resolved = await resolveFolderGitRoot(input.folderPanelRoot, input.repoRoot);
    if (input.operation.type === 'worktree-add') {
        await validateNewWorktreePathInsideHome(input.operation.path, [resolved.folderPanelRoot, resolved.repoRoot]);
    } else if (input.operation.type === 'worktree-remove') {
        await requireKnownWorktree(resolved.repoRoot, input.operation.path);
    }
    return previewGitWorktreeOperation(input.operation);
}

export async function runGitWorktreeOperation(repoRoot: string, operation: GitWorktreeOperation): Promise<GitWorktreeOperationResult> {
    if (!isWithinHome(repoRoot)) throw new Error('repo root is outside home');
    if (operation.type === 'worktree-add') {
        await validateNewWorktreePathInsideHome(operation.path, [repoRoot]);
    } else if (operation.type === 'worktree-remove') {
        const targetReal = await requireKnownWorktree(repoRoot, operation.path);
        if (!operation.force) {
            const status = await getGitStatusMap(targetReal, { includeIgnored: false, includeUntracked: true });
            if (status.dirty) throw new Error('worktree has uncommitted changes');
        }
    }
    const preview = previewGitWorktreeOperation(operation);
    const stdout = await runGit(preview.command.slice(1), repoRoot);
    const worktrees = await getGitWorktrees(repoRoot);
    return { repoRoot, preview, stdout, worktrees };
}
