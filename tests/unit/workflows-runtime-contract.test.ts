import { readSource } from './source-normalize.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

const __dirname = import.meta.dirname;
const projectRoot = join(__dirname, '../..');

const runtimeSrc = readSource(join(projectRoot, 'src/workflows/runtime.ts'), 'utf8');

test('WR-001: runtime imports from CLI_REGISTRY', () => {
    assert.ok(runtimeSrc.includes('CLI_REGISTRY'), 'must use CLI_REGISTRY');
});

test('WR-002: runtime does not import provider SDKs', () => {
    const sdks = ['openai', '@anthropic-ai/sdk', '@google/generative-ai', 'ai', '@ai-sdk/'];
    for (const sdk of sdks) {
        assert.ok(!runtimeSrc.includes(`from '${sdk}`), `must not import ${sdk}`);
    }
});

test('WR-003: runtime exports getAvailableRuntimes', () => {
    assert.ok(runtimeSrc.includes('getAvailableRuntimes'), 'must export runtime lister');
});

test('WR-004: runtime tracks experimental status', () => {
    assert.ok(runtimeSrc.includes('experimental'), 'must expose experimental flag');
});

test('WR-005: runtime includes binary info for dispatch', () => {
    assert.ok(runtimeSrc.includes('binary'), 'must expose binary name');
});

test('WR-006: runtime validates runtime keys', () => {
    assert.ok(runtimeSrc.includes('isValidRuntime'), 'must export validator');
});
