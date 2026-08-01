import test from 'node:test';
import assert from 'node:assert/strict';
import { scanStructuredFence, hasIncompleteStructuredFence } from '../../src/shared/structured-fence.ts';

test('structured fence scanner classifies absent content', () => {
    const scan = scanStructuredFence('plain response\n```json\n{"a":1}\n```');
    assert.equal(scan.status, 'absent');
    assert.equal(scan.completeCount, 0);
    assert.equal(scan.incompleteCount, 0);
});

test('structured fence scanner classifies complete elicitation fence', () => {
    const scan = scanStructuredFence('```elicitation\n{"questions":[]}\n```');
    assert.equal(scan.status, 'complete');
    assert.equal(scan.completeCount, 1);
    assert.deepEqual(scan.langs, ['elicitation']);
});

test('structured fence scanner classifies complete choice-buttons fence', () => {
    const scan = scanStructuredFence('```choice-buttons\n{"question":"Pick","options":["A"]}\n```');
    assert.equal(scan.status, 'complete');
    assert.equal(scan.completeCount, 1);
    assert.deepEqual(scan.langs, ['choice-buttons']);
});

test('structured fence scanner classifies complete search-results fence', () => {
    const scan = scanStructuredFence('```search-results\n{"schemaVersion":"search-results-v1","results":[]}\n```');
    assert.equal(scan.status, 'complete');
    assert.equal(scan.completeCount, 1);
    assert.deepEqual(scan.langs, ['search-results']);
});

test('structured fence scanner classifies complete compose-block fence', () => {
    const scan = scanStructuredFence('```compose-block\n{"schemaVersion":"compose-block-v1","variants":[]}\n```');
    assert.equal(scan.status, 'complete');
    assert.equal(scan.completeCount, 1);
    assert.deepEqual(scan.langs, ['compose-block']);
});

test('structured fence scanner classifies complete dataframe fence', () => {
    const scan = scanStructuredFence('```dataframe\n{"schemaVersion":"dataframe-v1","columns":[],"rows":[]}\n```');
    assert.equal(scan.status, 'complete');
    assert.equal(scan.completeCount, 1);
    assert.deepEqual(scan.langs, ['dataframe']);
});

test('structured fence scanner classifies complete chart-json fence', () => {
    const scan = scanStructuredFence('```chart-json\n{"schemaVersion":"chart-json-v1","labels":[],"data":[]}\n```');
    assert.equal(scan.status, 'complete');
    assert.equal(scan.completeCount, 1);
    assert.deepEqual(scan.langs, ['chart-json']);
});

test('structured fence scanner classifies unclosed elicitation fence as incomplete', () => {
    const text = '```elicitation\n{"questions":[{"id":"q","question":"unfinished';
    const scan = scanStructuredFence(text);
    assert.equal(scan.status, 'incomplete');
    assert.equal(scan.incompleteCount, 1);
    assert.equal(hasIncompleteStructuredFence(text), true);
});

test('structured fence scanner classifies unclosed search-results fence as incomplete', () => {
    const text = '```search-results\n{"schemaVersion":"search-results-v1","results":[';
    const scan = scanStructuredFence(text);
    assert.equal(scan.status, 'incomplete');
    assert.equal(scan.incompleteCount, 1);
    assert.equal(hasIncompleteStructuredFence(text), true);
});

test('structured fence scanner classifies new unclosed renderer fences as incomplete', () => {
    for (const lang of ['compose-block', 'dataframe', 'chart-json']) {
        const text = `\`\`\`${lang}\n{"schemaVersion":`;
        const scan = scanStructuredFence(text);
        assert.equal(scan.status, 'incomplete');
        assert.equal(scan.incompleteCount, 1);
        assert.equal(hasIncompleteStructuredFence(text), true);
    }
});

test('structured fence scanner ignores ordinary unclosed code fences', () => {
    const scan = scanStructuredFence('```ts\nconst x = 1;');
    assert.equal(scan.status, 'absent');
    assert.equal(scan.incompleteCount, 0);
});
