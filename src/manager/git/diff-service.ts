import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DashboardDiffMode, DashboardDiffRootPolicy, DashboardInstance } from '../types.js';
import { assertContainedLexical, isValidRef, isWithinHome } from './git-guards.js';
import { runGit } from './git-runner.js';

const DIFF_MODES = new Set(['unstaged', 'staged', 'head', 'base']);
const CANDIDATE_SOURCES = new Set(['project', 'working-dir', 'pinned', 'recent', 'home']);

export type DiffMode = DashboardDiffMode;
export type DiffOptions = {
    mode: DiffMode;
    ref?: string;
    includeUntracked: boolean;
};

export type DiffRootCandidate = {
    path: string;
    label: string;
    source: 'project' | 'working-dir' | 'pinned' | 'recent' | 'home';
};

export type DiffResolvedRoot = DiffRootCandidate & {
    root: string;
    branch: string | null;
    head: string | null;
    dirty: boolean;
};

export type DiffRootSettings = {
    diffRootPolicy: DashboardDiffRootPolicy;
    diffPinnedRootByPort: Record<string, string>;
    diffRecentRepoRoots: string[];
};

export type DiffFileSummary = {
    path: string;
    status: string;
    insertions: number;
    deletions: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function readDiffOptions(value: unknown): { ok: true; options: DiffOptions } | { ok: false; error: string } {
    const input = isRecord(value) ? value : {};
    const mode = DIFF_MODES.has(String(input['mode'])) ? input['mode'] as DiffMode : 'unstaged';
    const rawRef = typeof input['ref'] === 'string' && input['ref'].trim() ? input['ref'].trim() : undefined;
    if (rawRef !== undefined && !isValidRef(rawRef)) return { ok: false, error: 'invalid ref' };
    return {
        ok: true,
        options: {
            mode,
            includeUntracked: input['includeUntracked'] === true,
            ...((mode === 'base' || mode === 'head') ? { ref: mode === 'base' ? rawRef ?? 'HEAD' : 'HEAD' } : {}),
        },
    };
}

export function readCandidate(value: unknown): DiffRootCandidate | null {
    if (!isRecord(value)) return null;
    const path = typeof value['path'] === 'string' ? value['path'].trim() : '';
    const label = typeof value['label'] === 'string' && value['label'].trim() ? value['label'].trim() : path;
    const source = CANDIDATE_SOURCES.has(String(value['source'])) ? value['source'] as DiffRootCandidate['source'] : 'project';
    if (!path) return null;
    return { path, label: label.slice(0, 120), source };
}

function pushCandidate(candidates: DiffRootCandidate[], seen: Set<string>, candidate: DiffRootCandidate): void {
    const path = candidate.path.trim();
    if (!path || seen.has(path)) return;
    seen.add(path);
    candidates.push({ ...candidate, path });
}

export function buildDiffRootCandidates(instance: DashboardInstance | null, homePath: string, settings: DiffRootSettings): DiffRootCandidate[] {
    const candidates: DiffRootCandidate[] = [];
    const seen = new Set<string>();
    const port = instance?.port == null ? null : String(instance.port);
    const pinned = port ? settings.diffPinnedRootByPort[port] : null;
    const projectDirs = instance?.projectDirs?.filter(Boolean) ?? [];
    const workingDir = instance?.workingDir ?? null;

    if (settings.diffRootPolicy === 'manual' && pinned) pushCandidate(candidates, seen, { path: pinned, label: 'Pinned root', source: 'pinned' });
    const projectCandidates = projectDirs.map((path, index) => ({ path, label: index === 0 ? 'Project root' : `Project root ${index + 1}`, source: 'project' as const }));
    const workingCandidates = workingDir ? [{ path: workingDir, label: 'Working dir', source: 'working-dir' as const }] : [];
    const ordered = settings.diffRootPolicy === 'working-dir-first' ? [...workingCandidates, ...projectCandidates] : [...projectCandidates, ...workingCandidates];
    for (const candidate of ordered) pushCandidate(candidates, seen, candidate);
    if (settings.diffRootPolicy !== 'manual' && pinned) pushCandidate(candidates, seen, { path: pinned, label: 'Pinned root', source: 'pinned' });
    settings.diffRecentRepoRoots.forEach((path, index) => {
        pushCandidate(candidates, seen, { path, label: index === 0 ? 'Recent repo' : `Recent repo ${index + 1}`, source: 'recent' });
    });
    if (homePath) pushCandidate(candidates, seen, { path: homePath, label: 'Home fallback', source: 'home' });
    return candidates;
}

function pushDiffModeArgs(args: string[], options: DiffOptions): void {
    if (options.mode === 'staged') args.push('--cached');
    if (options.ref) args.push('--end-of-options', options.ref);
}

function parseNumstat(output: string): DiffFileSummary[] {
    return output.trim().split('\n').filter(Boolean).map(line => {
        const parts = line.split('\t');
        const ins = parseInt(parts[0] ?? '0', 10) || 0;
        const del = parseInt(parts[1] ?? '0', 10) || 0;
        const path = parts[2] ?? '';
        const status = ins > 0 && del === 0 ? 'added'
            : ins === 0 && del > 0 ? 'deleted'
            : 'modified';
        return { path, status, insertions: ins, deletions: del };
    }).filter(f => f.path);
}

async function listUntracked(repoRoot: string): Promise<DiffFileSummary[]> {
    const output = await runGit(['-c', 'core.quotepath=false', 'ls-files', '--others', '--exclude-standard'], repoRoot);
    return output.trim().split('\n').filter(Boolean).map(path => ({ path, status: 'untracked', insertions: 0, deletions: 0 }));
}

async function isUntracked(repoRoot: string, filePath: string): Promise<boolean> {
    const output = await runGit(['-c', 'core.quotepath=false', 'ls-files', '--others', '--exclude-standard', '--', filePath], repoRoot);
    return output.trim().split('\n').includes(filePath);
}

export async function resolveRepoCandidates(candidates: DiffRootCandidate[]): Promise<DiffResolvedRoot[]> {
    const seen = new Set<string>();
    const resolvedCandidates: DiffResolvedRoot[] = [];
    for (const candidate of candidates) {
        if (!isWithinHome(candidate.path)) continue;
        const resolved = resolve(candidate.path);
        if (!existsSync(resolved)) continue;
        try {
            const root = (await runGit(['rev-parse', '--show-toplevel'], resolved)).trim();
            if (!root || seen.has(root) || !isWithinHome(root)) continue;
            seen.add(root);
            const branch = (await runGit(['branch', '--show-current'], root).catch(() => '')).trim() || null;
            const head = (await runGit(['rev-parse', '--short', 'HEAD'], root).catch(() => '')).trim() || null;
            const dirty = Boolean((await runGit(['status', '--porcelain'], root).catch(() => '')).trim());
            resolvedCandidates.push({ ...candidate, root, branch, head, dirty });
        } catch {
            // Candidate is not a git repository.
        }
    }
    return resolvedCandidates;
}

export async function getRepoRoot(cwd: string): Promise<string> {
    if (!isWithinHome(cwd)) throw new Error('path not allowed');
    const resolved = resolve(cwd);
    if (!existsSync(resolved)) throw new Error('path does not exist');
    return (await runGit(['rev-parse', '--show-toplevel'], resolved)).trim();
}

export async function getDiffSummary(repoRoot: string, options: DiffOptions): Promise<DiffFileSummary[]> {
    if (!isWithinHome(repoRoot)) throw new Error('path not allowed');
    const args = ['-c', 'core.quotepath=false', 'diff', '--numstat'];
    pushDiffModeArgs(args, options);
    args.push('--');
    const output = await runGit(args, repoRoot);
    const files = parseNumstat(output);
    if (options.includeUntracked) files.push(...await listUntracked(repoRoot));
    return files;
}

export async function getFileDiff(repoRoot: string, filePath: string, options: DiffOptions): Promise<string> {
    if (!isWithinHome(repoRoot)) throw new Error('path not allowed');
    if (!assertContainedLexical(repoRoot, filePath)) throw new Error('path traversal');
    if (await isUntracked(repoRoot, filePath)) {
        return await runGit(['-c', 'core.quotepath=false', 'diff', '--no-color', '--no-index', '--', '/dev/null', filePath], repoRoot, [0, 1]);
    }
    const args = ['-c', 'core.quotepath=false', 'diff', '--no-color'];
    pushDiffModeArgs(args, options);
    args.push('--', filePath);
    return await runGit(args, repoRoot);
}
