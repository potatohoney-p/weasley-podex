import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeStoredZip } from './context-pack/zip-writer.js';
import { GPT_DEV_AGENT_CONTEXT_MARKDOWN, GPT_DEV_AGENT_CONTEXT_VERSION } from './code-dev-context-template.js';

export const GPT_DEV_AGENT_CONTEXT_BASENAME = 'gpt-dev-agent-context.zip';
export const GPT_DEV_AGENT_CONTEXT_MARKDOWN_ENTRY = 'GPT_DEV_AGENT_CONTEXT.md';
export const GPT_DEV_AGENT_CONTEXT_MANIFEST_ENTRY = 'MANIFEST.json';

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = dirname(dirname(dirname(MODULE_DIR)));

export interface CodeDevContextResult {
    path: string;
    displayPath: string;
    sizeBytes: number;
    source: 'installed-skill' | 'source-skill' | 'packaged-fallback';
    manifest: Record<string, unknown>;
}

export function resolveCodeDevContextPaths(options: { packageRoot?: string; jawHome?: string } = {}) {
    const packageRoot = options.packageRoot || PACKAGE_ROOT;
    const jawHome = options.jawHome || process.env["JAW_HOME"] || '';
    return {
        packageRoot,
        installedMarkdownPath: jawHome ? join(jawHome, 'skills', 'web-ai', 'modules', 'gpt-dev-agent-context.md') : '',
        installedZipPath: jawHome ? join(jawHome, 'skills', 'web-ai', 'modules', GPT_DEV_AGENT_CONTEXT_BASENAME) : '',
        sourceMarkdownPath: join(packageRoot, 'skills_ref', 'web-ai', 'modules', 'gpt-dev-agent-context.md'),
        sourceZipPath: join(packageRoot, 'skills_ref', 'web-ai', 'modules', GPT_DEV_AGENT_CONTEXT_BASENAME),
        fallbackZipPath: join(process.env["BROWSER_AGENT_HOME"] || jawHome || join(homedir(), '.podex-3460'), 'web-ai-context-packages', GPT_DEV_AGENT_CONTEXT_BASENAME),
    };
}

export async function ensureCodeDevContextZip(options: { packageRoot?: string; jawHome?: string } = {}): Promise<CodeDevContextResult> {
    const paths = resolveCodeDevContextPaths(options);
    for (const candidate of [
        { source: 'installed-skill' as const, markdownPath: paths.installedMarkdownPath, zipPath: paths.installedZipPath },
        { source: 'source-skill' as const, markdownPath: paths.sourceMarkdownPath, zipPath: paths.sourceZipPath },
    ]) {
        if (candidate.markdownPath && candidate.zipPath && await fileExists(candidate.zipPath)) {
            const stat = await fs.stat(candidate.zipPath);
            return { path: candidate.zipPath, displayPath: GPT_DEV_AGENT_CONTEXT_BASENAME, sizeBytes: stat.size, source: candidate.source, manifest: buildManifest(await readMarkdown(candidate.markdownPath)) };
        }
    }
    await fs.mkdir(dirname(paths.fallbackZipPath), { recursive: true });
    const manifest = buildManifest(GPT_DEV_AGENT_CONTEXT_MARKDOWN);
    await writeStoredZip(paths.fallbackZipPath, [
        { name: GPT_DEV_AGENT_CONTEXT_MARKDOWN_ENTRY, content: GPT_DEV_AGENT_CONTEXT_MARKDOWN },
        { name: GPT_DEV_AGENT_CONTEXT_MANIFEST_ENTRY, content: JSON.stringify(manifest, null, 2) },
    ]);
    const stat = await fs.stat(paths.fallbackZipPath);
    return { path: paths.fallbackZipPath, displayPath: GPT_DEV_AGENT_CONTEXT_BASENAME, sizeBytes: stat.size, source: 'packaged-fallback', manifest };
}

function buildManifest(markdown: string): Record<string, unknown> {
    return {
        name: 'gpt-dev-agent-context',
        version: GPT_DEV_AGENT_CONTEXT_VERSION,
        createdBy: 'podex browser web-ai code',
        entries: [GPT_DEV_AGENT_CONTEXT_MARKDOWN_ENTRY],
        sha256: createHash('sha256').update(markdown).digest('hex'),
    };
}

async function readMarkdown(path: string): Promise<string> {
    return fs.readFile(path, 'utf8').catch(() => GPT_DEV_AGENT_CONTEXT_MARKDOWN);
}

async function fileExists(path: string): Promise<boolean> {
    if (!path) return false;
    return fs.access(path).then(() => true).catch(() => false);
}

