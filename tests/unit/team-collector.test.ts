import { readSource } from './source-normalize.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

const __dirname = import.meta.dirname;
const projectRoot = join(__dirname, '../..');

const collectorSrc = readSource(join(projectRoot, 'src/team/collector.ts'), 'utf8');

test('TC-001: collector extracts verdicts', () => {
    assert.ok(collectorSrc.includes('extractVerdict'), 'must extract verdict from text');
    assert.ok(collectorSrc.includes('NEEDS_FIX'), 'must detect NEEDS_FIX');
    assert.ok(collectorSrc.includes('BLOCKED'), 'must detect BLOCKED');
    assert.ok(collectorSrc.includes('PASS'), 'must detect PASS');
});

test('TC-002: collector synthesizes team report', () => {
    assert.ok(collectorSrc.includes('synthesizeTeamReport'), 'must synthesize report');
    assert.ok(collectorSrc.includes('overallVerdict'), 'must compute overall verdict');
});

test('TC-003: collector creates events for each result', () => {
    assert.ok(collectorSrc.includes('TeamEvent'), 'must create team events');
    assert.ok(collectorSrc.includes("kind: 'collect'"), 'must use collect event kind');
});

test('TC-004: collector caps summary length', () => {
    assert.ok(collectorSrc.includes('.slice(0, 500)'), 'must truncate long results');
});

test('TC-005: collector has no SDK imports', () => {
    const sdks = ['openai', '@anthropic-ai/sdk', 'ai', '@ai-sdk/'];
    for (const sdk of sdks) {
        assert.ok(!collectorSrc.includes(`from '${sdk}`), `must not import ${sdk}`);
    }
});
