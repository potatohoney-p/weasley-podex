import test from 'node:test';
import assert from 'node:assert/strict';
import { findSafeCommitPoint, createStreamSink } from '../../src/cli/tui/stream.ts';

test('findSafeCommitPoint commits through a blank line outside a fence', () => {
    const s = 'hello world\n\nmore';
    const idx = findSafeCommitPoint(s);
    assert.equal(s.slice(0, idx), 'hello world\n\n');
});

test('findSafeCommitPoint never splits inside an open fence', () => {
    const s = 'intro\n\n```ts\nconst x = 1';
    const idx = findSafeCommitPoint(s);
    assert.equal(idx, 'intro\n\n'.length);
    assert.ok(!s.slice(0, idx).includes('```'));
});

test('findSafeCommitPoint commits through a closed fence', () => {
    const s = '```ts\nconst x = 1\n```\n';
    assert.equal(findSafeCommitPoint(s), s.length);
});

test('findSafeCommitPoint returns 0 with no boundary yet', () => {
    assert.equal(findSafeCommitPoint('partial line without newline'), 0);
});

test('stream sink never emits an unbalanced fence across chunks', () => {
    const writes: string[] = [];
    const sink = createStreamSink({ write: (s) => writes.push(s), width: 60, gutter: '  ' });
    sink.push('Here is code:\n\n```ts\n');
    sink.push('const x = 1;\n');
    sink.push('const y = 2;\n');
    const midFences = (writes.join('').match(/```/g) ?? []).length;
    assert.equal(midFences % 2, 0, 'no unbalanced fence committed mid-stream');
    sink.push('```\n');
    sink.end();
    const all = writes.join('');
    assert.ok(all.includes('const x = 1'));
    assert.ok(all.includes('const y = 2'));
    assert.equal((all.match(/```/g) ?? []).length % 2, 0, 'final fences balanced');
});
