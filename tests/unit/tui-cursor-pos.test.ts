import test from 'node:test';
import assert from 'node:assert/strict';
import { cursorScreenPos } from '../../src/cli/tui/renderers.ts';

// firstPrefixWidth=4 (e.g. "  ❯ "), contPrefixWidth=4 ("  · ")
test('single line, no wrap: col = prefix + text-before-cursor', () => {
    assert.deepEqual(cursorScreenPos('hi', 0, 4, 4, 80), { row: 0, col: 4, totalRows: 1 });
    assert.deepEqual(cursorScreenPos('hi', 1, 4, 4, 80), { row: 0, col: 5, totalRows: 1 });
    assert.deepEqual(cursorScreenPos('hi', 2, 4, 4, 80), { row: 0, col: 6, totalRows: 1 });
});

test('soft-wrap pushes the cursor to the next row', () => {
    // cols=10, prefix 4 → "abcdefgh": a@5 b@6 c@7 d@8 e@9 f@10 g→wrap row1 col1 h@2
    const pos = cursorScreenPos('abcdefgh', 8, 4, 4, 10);
    assert.equal(pos.row, 1);
    assert.equal(pos.col, 2);
    assert.equal(pos.totalRows, 2);
});

test('multi-line: newline starts a continuation row with cont prefix', () => {
    const pos = cursorScreenPos('a\nb', 3, 4, 4, 80); // cursor at end
    assert.equal(pos.row, 1);
    assert.equal(pos.col, 5); // contPrefix 4 + 'b'
    assert.equal(pos.totalRows, 2);
});

test('CJK double-width advances two columns', () => {
    const pos = cursorScreenPos('가', 1, 4, 4, 80);
    assert.equal(pos.col, 6); // 4 + width(가)=2
});

test('cursor offset clamps to text length', () => {
    const pos = cursorScreenPos('hi', 99, 4, 4, 80);
    assert.equal(pos.col, 6);
    assert.equal(pos.row, 0);
});
