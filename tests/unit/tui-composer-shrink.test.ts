import test from 'node:test';
import assert from 'node:assert/strict';
import { computeComposerVisualRows } from '../../bin/commands/tui/renderer.ts';

const prefix = '  ❯ ';
const cont = '  · ';

test('computeComposerVisualRows: single line is 1 row', () => {
    assert.equal(computeComposerVisualRows('hello', 80, prefix, cont), 1);
});

test('computeComposerVisualRows: explicit newlines add rows', () => {
    assert.equal(computeComposerVisualRows('line1\nline2\nline3', 80, prefix, cont), 3);
});

test('computeComposerVisualRows: soft wrap expands row count', () => {
    const long = 'x'.repeat(120);
    const rows = computeComposerVisualRows(long, 40, prefix, cont);
    assert.ok(rows >= 3, `expected wrap rows >= 3, got ${rows}`);
});

test('computeComposerVisualRows: shrink target is smaller than prior multiline', () => {
    const before = computeComposerVisualRows('a\nb\nc', 80, prefix, cont);
    const after = computeComposerVisualRows('a', 80, prefix, cont);
    assert.equal(before, 3);
    assert.equal(after, 1);
    assert.ok(after < before, 'shrunk composer should need fewer clear rows');
});
