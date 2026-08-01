import { readSource } from './source-normalize.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

const __dirname = import.meta.dirname;
const projectRoot = join(__dirname, '../..');

const typesSrc = readSource(join(projectRoot, 'src/workflows/checkpoint/types.ts'), 'utf8');
const storeSrc = readSource(join(projectRoot, 'src/workflows/checkpoint/store.ts'), 'utf8');

const SDK_DENYLIST = ['openai', '@anthropic-ai/sdk', 'ai', '@ai-sdk/'];

test('WCK-001: checkpoint types are SDK-free', () => {
    for (const sdk of SDK_DENYLIST) {
        assert.ok(!typesSrc.includes(`from '${sdk}`), `types must not import ${sdk}`);
        assert.ok(!storeSrc.includes(`from '${sdk}`), `store must not import ${sdk}`);
    }
});

test('WCK-002: checkpoint has required fields', () => {
    assert.ok(typesSrc.includes('checkpointId'), 'must have checkpointId');
    assert.ok(typesSrc.includes('workflowId'), 'must have workflowId');
    assert.ok(typesSrc.includes('files'), 'must track affected files');
    assert.ok(typesSrc.includes('gitRef'), 'must support git ref');
    assert.ok(typesSrc.includes('restoreAvailable'), 'must indicate if restore is possible');
});

test('WCK-003: checkpoint store creates checkpoints', () => {
    assert.ok(storeSrc.includes('createCheckpoint'), 'must export createCheckpoint');
});

test('WCK-004: checkpoint store supports retrieval', () => {
    assert.ok(storeSrc.includes('getCheckpoint'), 'must support get');
    assert.ok(storeSrc.includes('listCheckpoints'), 'must support list');
});

test('WCK-005: checkpoint store supports clear', () => {
    assert.ok(storeSrc.includes('clearCheckpoints'), 'must support clear');
});

test('WCK-006: checkpoint IDs are unique', () => {
    assert.ok(storeSrc.includes('randomUUID'), 'must use random component');
});
