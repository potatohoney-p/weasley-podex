import { readSource } from './source-normalize.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readdirSync, readFileSync, existsSync } from 'node:fs';

const __dirname = import.meta.dirname;
const projectRoot = join(__dirname, '../..');

const browserSrc = readSource(join(projectRoot, 'src/workflows/browser-web-ai.ts'), 'utf8');
const guardsSrc = readSource(join(projectRoot, 'src/workflows/web-ai-guards.ts'), 'utf8');

const SDK_DENYLIST = [
    'openai', '@openai/agents', '@anthropic-ai/sdk',
    '@google/generative-ai', '@google/genai', 'ai', '@ai-sdk/',
];

function scanForSdkImports(src: string): string[] {
    return SDK_DENYLIST.filter(sdk => src.includes(`from '${sdk}`) || src.includes(`from "${sdk}`));
}

test('BWA-001: browser-web-ai.ts has no SDK imports', () => {
    assert.deepEqual(scanForSdkImports(browserSrc), []);
});

test('BWA-002: web-ai-guards.ts has no SDK imports', () => {
    assert.deepEqual(scanForSdkImports(guardsSrc), []);
});

test('BWA-003: browser workflow uses observation/action contracts not SDK calls', () => {
    assert.ok(!browserSrc.includes('new OpenAI'), 'must not instantiate OpenAI');
    assert.ok(!browserSrc.includes('generateText'), 'must not call generateText');
    assert.ok(!browserSrc.includes('streamText'), 'must not call streamText');
});

test('BWA-004: browser workflow checks mutationAllowed', () => {
    assert.ok(browserSrc.includes('mutationAllowed'), 'must check mutationAllowed');
});

test('BWA-005: web-ai guards check vendor support', () => {
    assert.ok(guardsSrc.includes('vendor-unsupported'), 'must have unsupported vendor guard');
});

test('BWA-006: web-ai guards check mutation safety', () => {
    assert.ok(guardsSrc.includes('mutation-blocked'), 'must have mutation block guard');
});

test('BWA-007: source audit failure marks results as advisory', () => {
    assert.ok(guardsSrc.includes('source-audit-failed'), 'must have source audit guard');
    assert.ok(guardsSrc.includes('advisory'), 'must label failed audit as advisory');
});

test('BWA-008: no model-adapter path in workflow browser files', () => {
    assert.ok(!browserSrc.includes('model-adapter'), 'must not reference model-adapter');
    assert.ok(!guardsSrc.includes('model-adapter'), 'must not reference model-adapter');
});

test('BWA-009: no forbidden model adapter paths exist', () => {
    assert.ok(!existsSync(join(projectRoot, 'src/browser/web-ai/model-adapter')), 'model-adapter dir must not exist');
    assert.ok(!existsSync(join(projectRoot, 'src/model-adapter')), 'src/model-adapter must not exist');
});
