import { readSource } from './source-normalize.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';

const __dirname = import.meta.dirname;
const projectRoot = join(__dirname, '../..');

const adapterSrc = readSource(join(projectRoot, 'public/js/features/workflow-event-adapter.ts'), 'utf8');
const stateSrc = readSource(join(projectRoot, 'public/js/state.ts'), 'utf8');

const SDK_DENYLIST = ['ai', '@ai-sdk/', 'openai', '@anthropic-ai/sdk'];

test('WEA-001: adapter has no AI SDK imports', () => {
    for (const sdk of SDK_DENYLIST) {
        assert.ok(!adapterSrc.includes(`from '${sdk}`), `must not import ${sdk}`);
    }
});

test('WEA-002: adapter checks sequenceId for stale event rejection', () => {
    assert.ok(adapterSrc.includes('sequenceId'), 'must check sequenceId');
    assert.ok(adapterSrc.includes('shouldApplyEvent'), 'must have stale check function');
});

test('WEA-003: adapter detects sequence gaps', () => {
    assert.ok(adapterSrc.includes('hasSequenceGap'), 'must detect gaps');
});

test('WEA-004: adapter has reset for reconnect', () => {
    assert.ok(adapterSrc.includes('resetEventTracking'), 'must support reconnect reset');
});

test('WEA-005: state.ts has workflow tracking fields', () => {
    assert.ok(stateSrc.includes('lastWorkflowSequenceId'), 'must have sequence tracking');
    assert.ok(stateSrc.includes('workflowEventCount'), 'must have event count');
});

test('WEA-006: adapter uses schemaVersion discriminant', () => {
    assert.ok(adapterSrc.includes("'workflow-event-v1'"), 'must use stable schema version');
});

test('WEA-007: adapter handles goal completion event', () => {
    assert.ok(adapterSrc.includes("event.status === 'done'"), 'must handle done status');
});

test('WEA-008: state.ts initializes workflow fields', () => {
    assert.ok(stateSrc.includes('lastWorkflowSequenceId: -1'), 'must init sequence to -1');
    assert.ok(stateSrc.includes('workflowEventCount: 0'), 'must init count to 0');
});
