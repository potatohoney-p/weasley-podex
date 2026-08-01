import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    GPT_DEV_AGENT_CONTEXT_BASENAME,
    GPT_DEV_AGENT_CONTEXT_MANIFEST_ENTRY,
    GPT_DEV_AGENT_CONTEXT_MARKDOWN_ENTRY,
    ensureCodeDevContextZip,
    resolveCodeDevContextPaths,
} from '../../src/browser/web-ai/code-dev-context.js';
import { readZipTextEntry, verifyZipBuffer } from '../../src/browser/web-ai/code-artifact.js';

test('code dev-agent context resolves source skill paths without caller cwd', async () => {
    const before = process.cwd();
    const outside = await mkdtemp(join(tmpdir(), 'jaw-non-cwd-'));
    try {
        process.chdir(outside);
        const paths = resolveCodeDevContextPaths({ packageRoot: join(before) });
        assert.match(paths.sourceMarkdownPath, /skills_ref\/web-ai\/modules\/gpt-dev-agent-context\.md$/);
        assert.match(paths.sourceZipPath, /skills_ref\/web-ai\/modules\/gpt-dev-agent-context\.zip$/);
    } finally {
        process.chdir(before);
    }
});

test('code dev-agent context creates packaged fallback zip', async () => {
    const browserHome = await mkdtemp(join(tmpdir(), 'jaw-code-context-home-'));
    const packageRoot = await mkdtemp(join(tmpdir(), 'jaw-code-context-package-'));
    const result = await ensureCodeDevContextZip({ packageRoot, jawHome: browserHome });

    assert.equal(result.source, 'packaged-fallback');
    assert.equal(result.displayPath, GPT_DEV_AGENT_CONTEXT_BASENAME);
    assert.match(result.path, /gpt-dev-agent-context\.zip$/);
    assert.ok((await stat(result.path)).size > 100);
    assert.equal(result.manifest.name, 'gpt-dev-agent-context');
    assert.match(String(result.manifest.sha256), /^[a-f0-9]{64}$/);

    const buffer = await readFile(result.path);
    const verified = verifyZipBuffer(buffer);
    assert.ok(verified);
    assert.deepEqual(verified.files.sort(), [GPT_DEV_AGENT_CONTEXT_MANIFEST_ENTRY, GPT_DEV_AGENT_CONTEXT_MARKDOWN_ENTRY].sort());
    assert.match(readZipTextEntry(buffer, GPT_DEV_AGENT_CONTEXT_MARKDOWN_ENTRY) || '', /Linux sandbox/);
    assert.match(readZipTextEntry(buffer, GPT_DEV_AGENT_CONTEXT_MANIFEST_ENTRY) || '', /gpt-dev-agent-context/);
});
