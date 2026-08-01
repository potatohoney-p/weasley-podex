import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { VecStore, getVecDbPath } from '../../src/manager/memory/embedding/vec-store.ts';

let tempDir: string;
let store: VecStore;

function freshStore(dimensions = 4): VecStore {
    tempDir = mkdtempSync(join(tmpdir(), 'vec-test-'));
    const dbPath = join(tempDir, 'vec.sqlite');
    return new VecStore(dbPath, dimensions);
}

function makeEmbedding(dims: number, seed = 1): Float32Array {
    const arr = new Float32Array(dims);
    for (let i = 0; i < dims; i++) arr[i] = Math.sin(seed * (i + 1));
    return arr;
}

test('constructor creates schema without errors', () => {
    store = freshStore();
    const stats = store.getStats();
    assert.equal(stats.totalChunks, 0);
    assert.equal(stats.instances, 0);
    store.close();
    rmSync(tempDir, { recursive: true });
});

test('upsertVec inserts new chunk', () => {
    store = freshStore();
    store.upsertVec(null, {
        chunkId: 1,
        instanceId: 'inst-a',
        relpath: 'test.md',
        kind: 'semantic',
        contentHash: 'abc123',
        snippet: 'hello world',
        sourceStartLine: 0,
        sourceEndLine: 5,
    }, makeEmbedding(4), 'openai', 'text-embedding-3-small');

    const stats = store.getStats();
    assert.equal(stats.totalChunks, 1);
    assert.equal(stats.instances, 1);
    store.close();
    rmSync(tempDir, { recursive: true });
});

test('upsertVec updates existing chunk', () => {
    store = freshStore();
    store.upsertVec(null, {
        chunkId: 1, instanceId: 'inst-a', relpath: 'a.md',
        kind: 'semantic', contentHash: 'v1', snippet: 'first',
        sourceStartLine: 0, sourceEndLine: 5,
    }, makeEmbedding(4, 1), 'openai', 'model-a');

    const existing = store.getExistingHashes('inst-a');
    const rowid = existing.get(1)!.rowid;

    store.upsertVec(rowid, {
        chunkId: 1, instanceId: 'inst-a', relpath: 'a.md',
        kind: 'semantic', contentHash: 'v2', snippet: 'updated',
        sourceStartLine: 0, sourceEndLine: 5,
    }, makeEmbedding(4, 2), 'openai', 'model-a');

    const stats = store.getStats();
    assert.equal(stats.totalChunks, 1);

    const hashes = store.getExistingHashes('inst-a');
    assert.equal(hashes.get(1)!.contentHash, 'v2');

    store.close();
    rmSync(tempDir, { recursive: true });
});

test('getExistingHashes returns correct map', () => {
    store = freshStore();
    for (let i = 0; i < 3; i++) {
        store.upsertVec(null, {
            chunkId: i, instanceId: 'inst-a', relpath: `file${i}.md`,
            kind: 'semantic', contentHash: `hash${i}`, snippet: `chunk ${i}`,
            sourceStartLine: i * 10, sourceEndLine: i * 10 + 5,
        }, makeEmbedding(4, i), 'openai', 'model');
    }

    const map = store.getExistingHashes('inst-a');
    assert.equal(map.size, 3);
    assert.equal(map.get(0)!.contentHash, 'hash0');
    assert.equal(map.get(2)!.contentHash, 'hash2');

    const emptyMap = store.getExistingHashes('nonexistent');
    assert.equal(emptyMap.size, 0);

    store.close();
    rmSync(tempDir, { recursive: true });
});

test('getExistingHashesByRelpath scopes correctly', () => {
    store = freshStore();
    store.upsertVec(null, {
        chunkId: 1, instanceId: 'inst-a', relpath: 'a.md',
        kind: 'semantic', contentHash: 'h1', snippet: 's1',
        sourceStartLine: 0, sourceEndLine: 5,
    }, makeEmbedding(4, 1), 'openai', 'model');
    store.upsertVec(null, {
        chunkId: 2, instanceId: 'inst-a', relpath: 'b.md',
        kind: 'semantic', contentHash: 'h2', snippet: 's2',
        sourceStartLine: 0, sourceEndLine: 5,
    }, makeEmbedding(4, 2), 'openai', 'model');

    const mapA = store.getExistingHashesByRelpath('inst-a', 'a.md');
    assert.equal(mapA.size, 1);
    assert.equal(mapA.get(1)!.contentHash, 'h1');

    const mapB = store.getExistingHashesByRelpath('inst-a', 'b.md');
    assert.equal(mapB.size, 1);

    store.close();
    rmSync(tempDir, { recursive: true });
});

test('deleteByRowid removes chunk', () => {
    store = freshStore();
    store.upsertVec(null, {
        chunkId: 1, instanceId: 'inst-a', relpath: 'a.md',
        kind: 'semantic', contentHash: 'h1', snippet: 's1',
        sourceStartLine: 0, sourceEndLine: 5,
    }, makeEmbedding(4, 1), 'openai', 'model');

    const existing = store.getExistingHashes('inst-a');
    store.deleteByRowid(existing.get(1)!.rowid);

    assert.equal(store.getStats().totalChunks, 0);
    store.close();
    rmSync(tempDir, { recursive: true });
});

test('deleteByInstance removes all chunks for instance', () => {
    store = freshStore();
    for (let i = 0; i < 3; i++) {
        store.upsertVec(null, {
            chunkId: i, instanceId: 'inst-a', relpath: `f${i}.md`,
            kind: 'semantic', contentHash: `h${i}`, snippet: `s${i}`,
            sourceStartLine: 0, sourceEndLine: 5,
        }, makeEmbedding(4, i), 'openai', 'model');
    }
    store.upsertVec(null, {
        chunkId: 0, instanceId: 'inst-b', relpath: 'b.md',
        kind: 'semantic', contentHash: 'hb', snippet: 'sb',
        sourceStartLine: 0, sourceEndLine: 5,
    }, makeEmbedding(4, 99), 'openai', 'model');

    assert.equal(store.getStats().totalChunks, 4);
    store.deleteByInstance('inst-a');
    assert.equal(store.getStats().totalChunks, 1);
    assert.equal(store.getExistingHashes('inst-b').size, 1);

    store.close();
    rmSync(tempDir, { recursive: true });
});

test('search returns results sorted by distance', () => {
    store = freshStore();
    const base = makeEmbedding(4, 1);
    const similar = makeEmbedding(4, 1.1);
    const different = makeEmbedding(4, 50);

    store.upsertVec(null, {
        chunkId: 1, instanceId: 'inst-a', relpath: 'similar.md',
        kind: 'semantic', contentHash: 'h1', snippet: 'similar',
        sourceStartLine: 0, sourceEndLine: 5,
    }, similar, 'openai', 'model');
    store.upsertVec(null, {
        chunkId: 2, instanceId: 'inst-a', relpath: 'different.md',
        kind: 'semantic', contentHash: 'h2', snippet: 'different',
        sourceStartLine: 0, sourceEndLine: 5,
    }, different, 'openai', 'model');

    const results = store.search(base, 10);
    assert.equal(results.length, 2);
    assert.equal(results[0]!.relpath, 'similar.md');
    assert.ok(results[0]!.distance < results[1]!.distance);

    store.close();
    rmSync(tempDir, { recursive: true });
});

test('searchScoped filters by instanceId', () => {
    store = freshStore();
    store.upsertVec(null, {
        chunkId: 1, instanceId: 'inst-a', relpath: 'a.md',
        kind: 'semantic', contentHash: 'h1', snippet: 's1',
        sourceStartLine: 0, sourceEndLine: 5,
    }, makeEmbedding(4, 1), 'openai', 'model');
    store.upsertVec(null, {
        chunkId: 1, instanceId: 'inst-b', relpath: 'b.md',
        kind: 'semantic', contentHash: 'h2', snippet: 's2',
        sourceStartLine: 0, sourceEndLine: 5,
    }, makeEmbedding(4, 2), 'openai', 'model');

    const all = store.searchScoped(makeEmbedding(4, 1), 10, []);
    assert.equal(all.length, 2);

    const scopedA = store.searchScoped(makeEmbedding(4, 1), 10, ['inst-a']);
    assert.equal(scopedA.length, 1);
    assert.equal(scopedA[0]!.instanceId, 'inst-a');

    store.close();
    rmSync(tempDir, { recursive: true });
});

test('config get/set works', () => {
    store = freshStore();
    assert.equal(store.getConfig('provider'), undefined);

    store.setConfig('provider', 'openai');
    assert.equal(store.getConfig('provider'), 'openai');

    store.setConfig('provider', 'gemini');
    assert.equal(store.getConfig('provider'), 'gemini');

    store.close();
    rmSync(tempDir, { recursive: true });
});

test('getVecDbPath returns correct path', () => {
    const path = getVecDbPath('/home/user/.podex-dashboard');
    assert.equal(path, '/home/user/.podex-dashboard/vec_memory.sqlite');
});

test('dbSizeBytes is reported in stats', () => {
    store = freshStore();
    store.upsertVec(null, {
        chunkId: 1, instanceId: 'inst-a', relpath: 'a.md',
        kind: 'semantic', contentHash: 'h1', snippet: 's1',
        sourceStartLine: 0, sourceEndLine: 5,
    }, makeEmbedding(4, 1), 'openai', 'model');

    const stats = store.getStats();
    assert.ok(stats.dbSizeBytes > 0, `dbSizeBytes should be > 0, got ${stats.dbSizeBytes}`);

    store.close();
    rmSync(tempDir, { recursive: true });
});

