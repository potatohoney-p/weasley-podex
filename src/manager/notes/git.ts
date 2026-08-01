import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const execFileAsync = promisify(execFile);

export type NoteCommitEntry = {
    hash: string;
    date: string;
    message: string;
};

const AUTO_COMMIT_DEBOUNCE_MS = 30_000;
const GIT_TIMEOUT_MS = 10_000;
const MAX_LOG_LIMIT = 200;

export class NoteGitManager {
    private readonly root: string;
    private pendingPaths = new Set<string>();
    private commitTimer: ReturnType<typeof setTimeout> | null = null;
    private initialized = false;
    private gitAvailable: boolean | null = null;
    private gitCheckPromise: Promise<boolean>;

    constructor(root: string) {
        this.root = root;
        this.gitCheckPromise = this.doCheckGitAvailable();
    }

    private async doCheckGitAvailable(): Promise<boolean> {
        try {
            await execFileAsync('git', ['--version'], { timeout: 3000 });
            this.gitAvailable = true;
        } catch {
            this.gitAvailable = false;
        }
        return this.gitAvailable;
    }

    async isAvailable(): Promise<boolean> {
        if (this.gitAvailable !== null) return this.gitAvailable;
        return this.gitCheckPromise;
    }

    isInitialized(): boolean {
        return this.initialized;
    }

    async init(): Promise<void> {
        if (this.initialized) return;
        if (!await this.isAvailable()) return;
        const gitDir = join(this.root, '.git');
        if (!existsSync(gitDir)) {
            await this.git(['init']);
            await this.git(['config', 'user.name', 'Jawsidian']);
            await this.git(['config', 'user.email', 'jawsidian@local']);
            await writeFile(join(this.root, '.gitignore'), [
                '.assets/', '_plugins/', '_snippets/', '_templates/',
                '*.pdf', '*.png', '*.jpg', '*.jpeg', '*.gif', '*.webp',
            ].join('\n') + '\n', 'utf8');
            await this.git(['add', '-A']);
            try {
                await this.git(['commit', '-m', 'Initial commit', '--allow-empty']);
            } catch { /* empty repo */ }
        }
        this.initialized = true;
    }

    scheduleAutoCommit(relPath: string): void {
        this.pendingPaths.add(relPath);
        if (this.commitTimer) clearTimeout(this.commitTimer);
        this.commitTimer = setTimeout(() => { void this.flushCommit(); }, AUTO_COMMIT_DEBOUNCE_MS);
    }

    async flushCommit(): Promise<void> {
        if (this.commitTimer) { clearTimeout(this.commitTimer); this.commitTimer = null; }
        if (this.pendingPaths.size === 0) return;
        const paths = [...this.pendingPaths];
        this.pendingPaths.clear();
        try {
            await this.init();
            for (const relPath of paths) await this.git(['add', '--', relPath]);
            const { stdout: status } = await this.git(['status', '--porcelain']);
            if (!status.trim()) return;
            const message = paths.length === 1 ? `Update ${paths[0]}` : `Update ${paths.length} notes`;
            await this.git(['commit', '-m', message]);
        } catch (error) {
            console.error('[notes-git] auto-commit failed:', (error as Error).message);
        }
    }

    async log(relPath: string, limit = 50): Promise<NoteCommitEntry[]> {
        this.assertSafeRelPath(relPath);
        await this.init();
        const effectiveLimit = Math.min(Math.max(1, limit), MAX_LOG_LIMIT);
        try {
            const { stdout } = await this.git([
                'log', `--max-count=${effectiveLimit}`,
                '--format=%H%n%aI%n%s%n---', '--follow', '--', relPath,
            ]);
            return this.parseLog(stdout);
        } catch {
            return [];
        }
    }

    async show(hash: string, relPath: string): Promise<string> {
        await this.init();
        this.assertSafeHash(hash);
        this.assertSafeRelPath(relPath);
        const { stdout } = await this.git(['show', `${hash}:${relPath}`]);
        return stdout;
    }

    async diff(fromHash: string, toHash: string, relPath: string): Promise<string> {
        await this.init();
        this.assertSafeHash(fromHash);
        this.assertSafeHash(toHash);
        this.assertSafeRelPath(relPath);
        const { stdout } = await this.git(['diff', fromHash, toHash, '--', relPath]);
        return stdout;
    }

    async flush(): Promise<void> { await this.flushCommit(); }
    async shutdown(): Promise<void> { await this.flush(); }

    private parseLog(stdout: string): NoteCommitEntry[] {
        const entries: NoteCommitEntry[] = [];
        for (const block of stdout.split('---\n').filter(Boolean)) {
            const lines = block.trim().split('\n');
            if (lines.length < 3) continue;
            entries.push({ hash: lines[0]!, date: lines[1]!, message: lines.slice(2).join('\n') });
        }
        return entries;
    }

    private assertSafeHash(hash: string): void {
        if (!/^[0-9a-f]{7,40}$/i.test(hash)) throw Object.assign(new Error(`Invalid git hash: ${hash}`), { statusCode: 400 });
    }

    private assertSafeRelPath(relPath: string): void {
        if (!relPath.endsWith('.md')) throw new Error('Invalid note path: must end with .md');
        if (/(?:^|[/\\])\.\.(?:[/\\]|$)/.test(relPath)) throw new Error('Invalid note path: directory traversal not allowed');
        if (/[\0\n\r]/.test(relPath)) throw new Error('Invalid note path: contains invalid characters');
        if (relPath.startsWith('/') || relPath.startsWith('\\')) throw new Error('Invalid note path: must be relative');
        const topDir = relPath.split('/')[0] ?? '';
        const reserved = new Set(['.assets', '_templates', '_snippets', '_plugins', '.git']);
        if (reserved.has(topDir)) throw new Error('Invalid note path: reserved directory');
    }

    private async git(args: string[]): Promise<{ stdout: string; stderr: string }> {
        return execFileAsync('git', args, { cwd: this.root, timeout: GIT_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 });
    }
}
