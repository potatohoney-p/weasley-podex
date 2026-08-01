import test from 'node:test';
import assert from 'node:assert/strict';
import { clipTextToCols, visualWidth, wrapTextToCols } from '../../src/cli/tui/renderers.ts';

test('visualWidth ignores ANSI escape codes', () => {
    assert.equal(visualWidth('\x1b[31mabc\x1b[0m'), 3);
});

test('visualWidth counts Hangul as double-width', () => {
    assert.equal(visualWidth('가a'), 3);
});

test('visualWidth counts emoji as double-width and variation selectors as zero-width', () => {
    assert.equal(visualWidth('⏳'), 2);
    assert.equal(visualWidth('🦈'), 2);
    assert.equal(visualWidth('✔️'), 1);
});

test('clipTextToCols respects visual width for mixed-width text', () => {
    assert.equal(clipTextToCols('가나다abc', 5), '가나');
    assert.equal(clipTextToCols('가나다abc', 6), '가나다');
    assert.equal(clipTextToCols('가나다abc', 7), '가나다a');
});

test('clipTextToCols keeps emoji-heavy rows inside visual width', () => {
    const clipped = clipTextToCols('⏳ subagent: Verify estimateTokens callers: prompt with long detail 🦈 📁', 32);
    assert.ok(visualWidth(clipped) <= 32);
});

test('clipTextToCols preserves complete ANSI sequences and resets after clipping', () => {
    const clipped = clipTextToCols('\x1b[36mabcdef\x1b[0m', 3);
    assert.equal(clipped, '\x1b[36mabc\x1b[0m');
    assert.equal(visualWidth(clipped), 3);
});

test('clipTextToCols drops incomplete ANSI control sequences', () => {
    assert.equal(clipTextToCols('abc\x1b[', 10), 'abc');
});

test('wrapTextToCols wraps long ASCII lines into newline-free rows', () => {
    const rows = wrapTextToCols('abcdefghijklmnop', 5);
    assert.deepEqual(rows, ['abcde', 'fghij', 'klmno', 'p']);
    assert.equal(rows.some(row => row.includes('\n')), false);
    assert.ok(rows.every(row => visualWidth(row) <= 5));
});

test('wrapTextToCols preserves explicit newlines as separate physical rows', () => {
    const rows = wrapTextToCols('abc\ndefgh', 3);
    assert.deepEqual(rows, ['abc', 'def', 'gh']);
    assert.equal(rows.some(row => row.includes('\n')), false);
});

test('wrapTextToCols respects CJK visual width', () => {
    const rows = wrapTextToCols('가나다abc', 5);
    assert.deepEqual(rows, ['가나', '다abc']);
    assert.ok(rows.every(row => visualWidth(row) <= 5));
});

test('wrapTextToCols carries ANSI SGR styling to continuation rows', () => {
    const rows = wrapTextToCols('\x1b[36mabcdef\x1b[0m', 3);
    assert.deepEqual(rows, ['\x1b[36mabc\x1b[0m', '\x1b[36mdef\x1b[0m']);
    assert.ok(rows.every(row => visualWidth(row) <= 3));
});
