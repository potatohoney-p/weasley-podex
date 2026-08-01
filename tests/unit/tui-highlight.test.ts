import test from 'node:test';
import assert from 'node:assert/strict';
import { hljsToAnsi, highlightCode, initHighlight } from '../../src/cli/tui/highlight.ts';

// The ambient test env sets NO_COLOR=1, so color tests must explicitly simulate a
// color-capable terminal (clear NO_COLOR + FORCE_COLOR), and restore afterwards.
function withEnvs(overrides: Record<string, string | undefined>, fn: () => void): void {
    const prev: Record<string, string | undefined> = {};
    for (const k of Object.keys(overrides)) {
        prev[k] = process.env[k];
        const v = overrides[k];
        if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
    try { fn(); }
    finally {
        for (const k of Object.keys(overrides)) {
            const p = prev[k];
            if (p === undefined) delete process.env[k]; else process.env[k] = p;
        }
    }
}
const COLOR: Record<string, string | undefined> = { NO_COLOR: undefined, FORCE_COLOR: '3' };
const MONO: Record<string, string | undefined> = { NO_COLOR: '1', FORCE_COLOR: undefined };

test('hljsToAnsi maps a keyword span to a truecolor escape', () => {
    withEnvs(COLOR, () => {
        const out = hljsToAnsi('<span class="hljs-keyword">const</span> x');
        assert.ok(out.includes('\x1b[38;2;'), 'has truecolor escape');
        assert.ok(out.includes('const'));
        assert.ok(!out.includes('<span'));
    });
});

test('hljsToAnsi unescapes HTML entities', () => {
    withEnvs(COLOR, () => {
        assert.ok(hljsToAnsi('a &lt; b &amp;&amp; c').includes('a < b && c'));
    });
});

test('hljsToAnsi handles nested spans without leaking tags', () => {
    withEnvs(COLOR, () => {
        const out = hljsToAnsi('<span class="hljs-function"><span class="hljs-keyword">function</span> foo</span> bar');
        assert.ok(out.includes('function') && out.includes('foo') && out.includes('bar'));
        assert.ok(!out.includes('<span'));
    });
});

test('hljsToAnsi in mono strips tags with no color', () => {
    withEnvs(MONO, () => {
        assert.equal(hljsToAnsi('<span class="hljs-keyword">const</span> x'), 'const x');
    });
});

test('hljsToAnsi tolerates malformed html', () => {
    withEnvs(COLOR, () => {
        assert.doesNotThrow(() => hljsToAnsi('<span class="hljs-keyword">unclosed'));
    });
});

test('highlightCode returns plain code for unknown language', async () => {
    await initHighlight();
    withEnvs(COLOR, () => {
        assert.equal(highlightCode('xyz', 'no-such-lang'), 'xyz');
    });
});

test('highlightCode highlights a known language to ANSI', async () => {
    await initHighlight();
    withEnvs(COLOR, () => {
        const out = highlightCode('const x = 1;', 'ts');
        assert.ok(out.includes('\x1b['), 'contains ANSI');
        assert.ok(!out.includes('<span'));
        assert.ok(out.includes('x'));
    });
});

test('highlightCode returns plain in mono mode', async () => {
    await initHighlight();
    withEnvs(MONO, () => {
        assert.equal(highlightCode('const x = 1;', 'ts'), 'const x = 1;');
    });
});
