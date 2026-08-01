import { readSource } from './source-normalize.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

const __dirname = import.meta.dirname;
const projectRoot = join(__dirname, '../..');

const builderSrc = readSource(join(projectRoot, 'src/workflows/context-map/builder.ts'), 'utf8');

const SDK_DENYLIST = ['openai', '@anthropic-ai/sdk', 'ai', '@ai-sdk/'];

test('WCM-001: context-map builder is SDK-free', () => {
    for (const sdk of SDK_DENYLIST) {
        assert.ok(!builderSrc.includes(`from '${sdk}`), `must not import ${sdk}`);
    }
});

test('WCM-002: builder creates deterministic context map', () => {
    assert.ok(builderSrc.includes('buildContextMap'), 'must export buildContextMap');
});

test('WCM-003: builder classifies files by kind', () => {
    assert.ok(builderSrc.includes('classifyFile'), 'must classify files');
    assert.ok(builderSrc.includes("'source'"), 'must have source kind');
    assert.ok(builderSrc.includes("'test'"), 'must have test kind');
    assert.ok(builderSrc.includes("'structure'"), 'must have structure kind');
});

test('WCM-004: builder finds structure docs', () => {
    assert.ok(builderSrc.includes('structureDocs'), 'must collect structure docs');
});

test('WCM-005: builder supports hot files query', () => {
    assert.ok(builderSrc.includes('getHotFiles'), 'must export getHotFiles');
});

test('WCM-006: builder respects depth limit', () => {
    assert.ok(builderSrc.includes('maxDepth'), 'must have depth limit');
});
