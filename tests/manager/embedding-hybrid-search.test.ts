import test from 'node:test';
import assert from 'node:assert/strict';
import { hybridMerge } from '../../src/manager/memory/embedding/hybrid-search.ts';
import type { SearchHit } from '../../src/memory/shared.ts';
import type { VecSearchHit } from '../../src/manager/memory/embedding/vec-store.ts';

function makeFtsHit(instanceId: string, relpath: string, line: number, score = 1): SearchHit & { instanceId: string } {
    return {
        path: `/memory/${relpath}`,
        relpath,
        kind: 'semantic',
        source_start_line: line,
        source_end_line: line + 5,
        snippet: `fts snippet for ${relpath}`,
        score,
        instanceId,
    };
}

function makeVecHit(instanceId: string, relpath: string, line: number, distance = 0.5): VecSearchHit {
    return {
        chunkId: Math.floor(Math.random() * 10000),
        instanceId,
        relpath,
        kind: 'semantic',
        contentHash: 'abc123',
        snippet: `vec snippet for ${relpath}`,
        sourceStartLine: line,
        sourceEndLine: line + 5,
        distance,
    };
}

test('empty inputs return empty array', () => {
    const result = hybridMerge({ ftsHits: [], vecHits: [], limit: 10 });
    assert.equal(result.length, 0);
});

test('fts-only hits produce valid results with RRF scores', () => {
    const ftsHits = [
        makeFtsHit('3457', 'a.md', 1),
        makeFtsHit('3457', 'b.md', 10),
    ];
    const result = hybridMerge({ ftsHits, vecHits: [], limit: 10 });
    assert.equal(result.length, 2);
    assert.equal(result[0]!.relpath, 'a.md');
    assert.ok(result[0]!.hybridScore > result[1]!.hybridScore);
    assert.equal(result[0]!.ftsRank, 0);
    assert.equal(result[1]!.ftsRank, 1);
    assert.equal(result[0]!.vecRank, undefined);
});

test('vec-only hits produce valid results with RRF scores', () => {
    const vecHits = [
        makeVecHit('3457', 'x.md', 1, 0.1),
        makeVecHit('3457', 'y.md', 5, 0.9),
    ];
    const result = hybridMerge({ ftsHits: [], vecHits, limit: 10 });
    assert.equal(result.length, 2);
    assert.equal(result[0]!.relpath, 'x.md');
    assert.ok(result[0]!.hybridScore > result[1]!.hybridScore);
    assert.equal(result[0]!.vecRank, 0);
    assert.equal(result[0]!.ftsRank, undefined);
    assert.equal(result[0]!.embeddingDistance, 0.1);
});

test('overlapping hits get boosted RRF score', () => {
    const ftsHits = [makeFtsHit('3457', 'a.md', 1), makeFtsHit('3457', 'b.md', 10)];
    const vecHits = [makeVecHit('3457', 'a.md', 1, 0.1), makeVecHit('3457', 'c.md', 20, 0.3)];
    const result = hybridMerge({ ftsHits, vecHits, limit: 10 });

    const aHit = result.find(r => r.relpath === 'a.md')!;
    const bHit = result.find(r => r.relpath === 'b.md')!;
    const cHit = result.find(r => r.relpath === 'c.md')!;

    assert.ok(aHit.hybridScore > bHit.hybridScore, 'overlapping hit a.md should rank highest');
    assert.ok(aHit.hybridScore > cHit.hybridScore, 'overlapping hit should beat single-source');
    assert.equal(aHit.ftsRank, 0);
    assert.equal(aHit.vecRank, 0);
    assert.equal(aHit.embeddingDistance, 0.1);
});

test('limit caps output size', () => {
    const ftsHits = Array.from({ length: 20 }, (_, i) => makeFtsHit('3457', `file${i}.md`, i * 10));
    const result = hybridMerge({ ftsHits, vecHits: [], limit: 5 });
    assert.equal(result.length, 5);
});

test('custom k parameter changes RRF denominator', () => {
    const ftsHits = [makeFtsHit('3457', 'a.md', 1)];
    const resultDefault = hybridMerge({ ftsHits, vecHits: [], limit: 10 });
    const resultK10 = hybridMerge({ ftsHits, vecHits: [], limit: 10, k: 10 });

    assert.equal(resultDefault[0]!.hybridScore, 1 / (60 + 0 + 1));
    assert.equal(resultK10[0]!.hybridScore, 1 / (10 + 0 + 1));
});

test('results are sorted by hybridScore descending', () => {
    const ftsHits = [
        makeFtsHit('3457', 'c.md', 1),
        makeFtsHit('3457', 'a.md', 10),
        makeFtsHit('3457', 'b.md', 20),
    ];
    const vecHits = [
        makeVecHit('3457', 'a.md', 10, 0.1),
    ];
    const result = hybridMerge({ ftsHits, vecHits, limit: 10 });

    for (let i = 1; i < result.length; i++) {
        assert.ok(result[i - 1]!.hybridScore >= result[i]!.hybridScore,
            `result[${i - 1}].hybridScore (${result[i - 1]!.hybridScore}) >= result[${i}].hybridScore (${result[i]!.hybridScore})`);
    }
});

test('multi-instance hits are keyed independently', () => {
    const ftsHits = [
        makeFtsHit('3457', 'a.md', 1),
        makeFtsHit('3458', 'a.md', 1),
    ];
    const result = hybridMerge({ ftsHits, vecHits: [], limit: 10 });
    assert.equal(result.length, 2);
    const instances = result.map(r => r.instanceId);
    assert.ok(instances.includes('3457'));
    assert.ok(instances.includes('3458'));
});

test('same file different lines are separate entries', () => {
    const ftsHits = [
        makeFtsHit('3457', 'a.md', 1),
        makeFtsHit('3457', 'a.md', 100),
    ];
    const result = hybridMerge({ ftsHits, vecHits: [], limit: 10 });
    assert.equal(result.length, 2);
});
