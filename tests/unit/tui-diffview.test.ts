import test from 'node:test';
import assert from 'node:assert/strict';
import { colorizeDiff } from '../../src/cli/tui/diffview.ts';

// Ambient test env sets NO_COLOR=1; color tests must simulate a color terminal.
function withColor(fn: () => void): void {
    const noColor = process.env.NO_COLOR;
    const force = process.env.FORCE_COLOR;
    delete process.env.NO_COLOR;
    process.env.FORCE_COLOR = '3';
    try { fn(); }
    finally {
        if (noColor === undefined) delete process.env.NO_COLOR; else process.env.NO_COLOR = noColor;
        if (force === undefined) delete process.env.FORCE_COLOR; else process.env.FORCE_COLOR = force;
    }
}

const SAMPLE = [
    'diff --git a/x.ts b/x.ts',
    'index 111..222 100644',
    '--- a/x.ts',
    '+++ b/x.ts',
    '@@ -1,2 +1,2 @@',
    '-const x = 1;',
    '+const x = 2;',
    ' unchanged',
].join('\n');

test('colorizeDiff returns empty for empty/blank input', () => {
    assert.equal(colorizeDiff(''), '');
    assert.equal(colorizeDiff('\n\n'), '');
});

test('colorizeDiff colors lines and prepends the gutter', () => {
    withColor(() => {
        const out = colorizeDiff(SAMPLE, { gutter: '  ' });
        assert.ok(out.includes('\x1b[38;2;'), 'has truecolor escapes');
        for (const line of out.split('\n')) {
            assert.ok(line.startsWith('  '), `gutter missing: ${JSON.stringify(line)}`);
        }
        assert.ok(out.includes('const x = 1;'));
        assert.ok(out.includes('const x = 2;'));
    });
});

test('colorizeDiff truncates to maxLines and appends a summary', () => {
    const many = Array.from({ length: 100 }, (_, i) => `+line ${i}`).join('\n');
    const out = colorizeDiff(many, { maxLines: 10, gutter: '  ' });
    const lines = out.split('\n');
    assert.equal(lines.length, 11); // 10 body + 1 "more" line
    assert.ok(out.includes('+90 more lines'));
});

test('colorizeDiff in mono keeps content without color escapes', () => {
    const noColor = process.env.NO_COLOR;
    process.env.NO_COLOR = '1';
    try {
        const out = colorizeDiff(SAMPLE, { gutter: '  ' });
        assert.ok(!out.includes('\x1b[38;2;'));
        assert.ok(out.includes('const x = 2;'));
    } finally {
        if (noColor === undefined) delete process.env.NO_COLOR; else process.env.NO_COLOR = noColor;
    }
});
