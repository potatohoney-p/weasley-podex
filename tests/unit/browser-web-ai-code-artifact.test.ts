import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    fetchBinaryBase64,
    hasPlanArtifact,
    readZipTextEntry,
    retrieveAllCodeArtifacts,
    retrieveCodeArtifact,
    scanConversationForAllZips,
    scanConversationForZip,
    verifyZipBuffer,
} from '../../src/browser/web-ai/code-artifact.js';

const FIXTURE_ZIP_B64 = 'UEsDBAoAAAAAANwQy1wgMDo2BgAAAAYAAAAJABwAUkVBRE1FLm1kVVQJAAOwmSlqsJkpanV4CwABBPUBAAAEAAAAAGhlbGxvClBLAwQKAAAAAADcEMtcAAAAAAAAAAAAAAAABAAcAHNyYy9VVAkAA7CZKWqwmSlqdXgLAAEE9QEAAAQAAAAAUEsDBAoAAAAAANwQy1wH7v1xDwAAAA8AAAAIABwAc3JjL2EuanNVVAkAA7CZKWqwmSlqdXgLAAEE9QEAAAQAAAAAY29uc29sZS5sb2coMSkKUEsBAh4DCgAAAAAA3BDLXCAwOjYGAAAABgAAAAkAGAAAAAAAAQAAAKSBAAAAAFJFQURNRS5tZFVUBQADsJkpanV4CwABBPUBAAAEAAAAAFBLAQIeAwoAAAAAANwQy1wAAAAAAAAAAAAAAAAEABgAAAAAAAAAEADtQUkAAABzcmMvVVQFAAOwmSlqdXgLAAEE9QEAAAQAAAAAUEsBAh4DCgAAAAAA3BDLXAfu/XEPAAAADwAAAAgAGAAAAAAAAQAAAKSBhwAAAHNyYy9hLmpzVVQFAAOwmSlqdXgLAAEE9QEAAAQAAAAAUEsFBgAAAAADAAMA5wAAANgAAAAAAA==';
const PLAN_ZIP_B64 = 'UEsDBAoAAAAAAO41y1w9+YHGFAAAABQAAAAHABwAUExBTi5tZFVUCQADcNspanDbKWp1eAsAAQT1AQAABBQAAAAjIFBsYW4KLSBbIF0gdmVyaWZ5ClBLAwQKAAAAAADuNctcIDA6NgYAAAAGAAAACQAcAFJFQURNRS5tZFVUCQADcNspanDbKWp1eAsAAQT1AQAABBQAAABoZWxsbwpQSwMECgAAAAAA7jXLXAfu/XEPAAAADwAAAAgAHABzcmMvYS5qc1VUCQADcNspanDbKWp1eAsAAQT1AQAABBQAAABjb25zb2xlLmxvZygxKQpQSwECHgMKAAAAAADuNctcPfmBxhQAAAAUAAAABwAYAAAAAAABAAAApIEAAAAAUExBTi5tZFVUBQADcNspanV4CwABBPUBAAAEFAAAAFBLAQIeAwoAAAAAAO41y1wgMDo2BgAAAAYAAAAJABgAAAAAAAEAAACkgVUAAABSRUFETUUubWRVVAUAA3DbKWp1eAsAAQT1AQAABBQAAABQSwECHgMKAAAAAADuNctcB+79cQ8AAAAPAAAACAAYAAAAAAABAAAApIGeAAAAc3JjL2EuanNVVAUAA3DbKWp1eAsAAQT1AQAABBQAAABQSwUGAAAAAAMAAwDqAAAA7wAAAAAA';

function conversationFixture() {
    return {
        mapping: {
            a: { message: { id: 'mid-prompt', content: { content_type: 'text', parts: ['make a zip'] } } },
            b: { message: { id: 'mid-code', content: { content_type: 'code', text: 'bash -lc zip ...' } } },
            c: { message: { id: 'mid-output', content: { content_type: 'execution_output', text: '' } } },
            d: { message: { id: 'mid-final', content: { content_type: 'text', parts: ['/mnt/data/result.zip'] } } },
        },
    };
}

function makeRetrievalPage({ conversation, urlByMid = {}, binaryByUrl = {} }: { conversation: unknown; urlByMid?: Record<string, string>; binaryByUrl?: Record<string, unknown> }) {
    return {
        evaluate: async (_fn: unknown, arg: unknown) => {
            if (typeof arg === 'string' && arg.startsWith('http')) return binaryByUrl[arg] ?? null;
            if (typeof arg === 'string') return conversation;
            if (arg && typeof arg === 'object' && 'messageId' in arg) return urlByMid[String((arg as { messageId: string }).messageId)] ?? null;
            return null;
        },
    };
}

test('code artifact scanner finds sandbox path and candidate tool messages', () => {
    const result = scanConversationForZip(conversationFixture());
    assert.equal(result.zipPath, '/mnt/data/result.zip');
    assert.deepEqual(result.candidateMids, ['mid-code', 'mid-output']);
});

test('code artifact zip verifier detects and reads PLAN.md', () => {
    const buffer = Buffer.from(PLAN_ZIP_B64, 'base64');
    const verified = verifyZipBuffer(buffer);
    assert.ok(verified);
    assert.ok(verified.files.includes('PLAN.md'));
    assert.equal(hasPlanArtifact(verified.files), true);
    assert.match(readZipTextEntry(buffer, 'PLAN.md') || '', /# Plan/);
    assert.equal(verifyZipBuffer(Buffer.from('not a zip, padded beyond min length')), null);
});

test('code artifact retrieval saves valid zip and fails closed on missing plan when required', async () => {
    const outputPath = join(tmpdir(), 'jaw-code-artifact-test', 'result.zip');
    rmSync(outputPath, { force: true });
    const page = makeRetrievalPage({
        conversation: conversationFixture(),
        urlByMid: { 'mid-output': 'https://chatgpt.com/backend-api/estuary/content?id=f&sig=s' },
        binaryByUrl: { 'https://chatgpt.com/backend-api/estuary/content?id=f&sig=s': { status: 200, base64: FIXTURE_ZIP_B64 } },
    });

    const ok = await retrieveCodeArtifact(page, { conversationId: 'conv-1', outputPath });
    assert.equal(ok.ok, true);
    assert.equal(ok.zipPath, '/mnt/data/result.zip');
    assert.ok(ok.files.includes('src/a.js'));
    assert.equal(existsSync(outputPath), true);
    assert.equal(readFileSync(outputPath).length, ok.sizeBytes);

    const planRequired = await retrieveCodeArtifact(page, { conversationId: 'conv-1', outputPath, requirePlan: true });
    assert.equal(planRequired.ok, false);
    assert.equal(planRequired.reason, 'code-artifact:plan-missing');
});

test('code artifact retrieval prefers the NEWEST mid when several runs minted the same sandbox path (drop10 stale incident)', async () => {
    const outputPath = join(tmpdir(), 'jaw-code-artifact-test', 'newest.zip');
    rmSync(outputPath, { force: true });
    // Both mids mint a URL for /mnt/data/result.zip: the older snapshot lacks
    // PLAN.md (FIXTURE zip), the latest rebuild has it (PLAN zip). Oldest-first
    // selection used to return the stale snapshot — newest-first must win.
    const page = makeRetrievalPage({
        conversation: conversationFixture(),
        urlByMid: {
            'mid-code': 'https://chatgpt.com/stale',
            'mid-output': 'https://chatgpt.com/fresh',
        },
        binaryByUrl: {
            'https://chatgpt.com/stale': { status: 200, base64: FIXTURE_ZIP_B64 },
            'https://chatgpt.com/fresh': { status: 200, base64: PLAN_ZIP_B64 },
        },
    });
    const result = await retrieveCodeArtifact(page, { conversationId: 'conv-1', outputPath });
    assert.equal(result.ok, true);
    assert.equal(result.mintedMessageId, 'mid-output');
    assert.ok(result.files.includes('PLAN.md'));
});

test('code artifact retrieval reports clear unavailable/missing/download errors', async () => {
    const outputPath = join(tmpdir(), 'jaw-code-artifact-test', 'errors.zip');
    assert.equal((await retrieveCodeArtifact({ evaluate: async () => null }, { conversationId: 'conv-1', outputPath })).reason, 'code-artifact:conversation-unavailable');
    assert.equal((await retrieveCodeArtifact(makeRetrievalPage({ conversation: { mapping: {} } }), { conversationId: 'conv-1', outputPath })).reason, 'code-artifact:missing');
    assert.equal((await retrieveCodeArtifact(makeRetrievalPage({ conversation: conversationFixture() }), { conversationId: 'conv-1', outputPath })).reason, 'code-artifact:download-failed');
});

test('code artifact multi-zip scan and retrieval preserve first-seen order', async () => {
    const conversation = {
        mapping: {
            a: { message: { id: 'mid-code', content: { content_type: 'code', text: '/mnt/data/backend.zip /mnt/data/frontend.zip' } } },
            b: { message: { id: 'mid-final', content: { content_type: 'text', parts: ['/mnt/data/backend.zip\n/mnt/data/frontend.zip'] } } },
        },
    };
    const scan = scanConversationForAllZips(conversation);
    assert.deepEqual(scan.zipPaths, ['/mnt/data/backend.zip', '/mnt/data/frontend.zip']);
    assert.deepEqual(scan.candidateMids, ['mid-code']);

    const outputDir = join(tmpdir(), 'jaw-code-artifact-multi');
    rmSync(outputDir, { force: true, recursive: true });
    let lastSandbox = '';
    const page = {
        evaluate: async (_fn: unknown, arg: unknown) => {
            if (typeof arg === 'string' && arg.startsWith('http')) return { status: 200, base64: PLAN_ZIP_B64 };
            if (typeof arg === 'string') return conversation;
            if (arg && typeof arg === 'object' && 'sandboxPath' in arg) {
                lastSandbox = String((arg as { sandboxPath: string }).sandboxPath);
                return 'https://chatgpt.com/estuary?p=' + encodeURIComponent(lastSandbox);
            }
            return null;
        },
    };
    const result = await retrieveAllCodeArtifacts(page, { conversationId: 'conv-1', outputDir, requirePlan: true });
    assert.equal(result.ok, true);
    assert.equal(result.artifacts.length, 2);
    assert.equal(existsSync(join(outputDir, 'backend.zip')), true);
    assert.equal(existsSync(join(outputDir, 'frontend.zip')), true);
});

test('fetchBinaryBase64 passes target URL into page evaluate', async () => {
    const page = makeRetrievalPage({ conversation: null, binaryByUrl: { 'https://x/y': { status: 200, base64: 'QQ==' } } });
    assert.deepEqual(await fetchBinaryBase64(page, 'https://x/y'), { status: 200, base64: 'QQ==' });
});
