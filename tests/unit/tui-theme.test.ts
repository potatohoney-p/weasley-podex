import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveColorLevel, fgToken, paint, activeTheme, BOLD, RESET } from '../../src/cli/tui/theme.ts';

// resolveColorLevel is pure — test the full capability truth table directly.
test('resolveColorLevel: NO_COLOR / CLICOLOR=0 force mono', () => {
    assert.equal(resolveColorLevel({ NO_COLOR: '1' }, true), 'mono');
    assert.equal(resolveColorLevel({ NO_COLOR: '' }, true), 'mono'); // any value disables
    assert.equal(resolveColorLevel({ CLICOLOR: '0' }, true), 'mono');
});

test('resolveColorLevel: FORCE_COLOR overrides each level', () => {
    assert.equal(resolveColorLevel({ FORCE_COLOR: '0' }, false), 'mono');
    assert.equal(resolveColorLevel({ FORCE_COLOR: '1' }, false), 'ansi16');
    assert.equal(resolveColorLevel({ FORCE_COLOR: '2' }, false), 'ansi256');
    assert.equal(resolveColorLevel({ FORCE_COLOR: '3' }, false), 'truecolor');
});

test('resolveColorLevel: non-TTY without force is mono', () => {
    assert.equal(resolveColorLevel({}, false), 'mono');
});

test('resolveColorLevel: TTY detection via COLORTERM/TERM', () => {
    assert.equal(resolveColorLevel({ COLORTERM: 'truecolor' }, true), 'truecolor');
    assert.equal(resolveColorLevel({ COLORTERM: '24bit' }, true), 'truecolor');
    assert.equal(resolveColorLevel({ TERM: 'xterm-256color' }, true), 'ansi256');
    assert.equal(resolveColorLevel({ TERM: 'xterm' }, true), 'ansi16');
    assert.equal(resolveColorLevel({ TERM: 'dumb' }, true), 'mono');
});

function withEnvs(o: Record<string, string | undefined>, fn: () => void): void {
    const prev: Record<string, string | undefined> = {};
    for (const k of Object.keys(o)) {
        prev[k] = process.env[k];
        const v = o[k];
        if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
    try { fn(); }
    finally {
        for (const k of Object.keys(o)) {
            const p = prev[k];
            if (p === undefined) delete process.env[k]; else process.env[k] = p;
        }
    }
}

test('fgToken emits the right escape per level (accent #62a8f5)', () => {
    withEnvs({ NO_COLOR: undefined, JAW_TUI_THEME: undefined, FORCE_COLOR: '3' }, () => {
        assert.equal(fgToken('accent'), '\x1b[38;2;98;168;245m');
    });
    withEnvs({ NO_COLOR: undefined, FORCE_COLOR: '2' }, () => {
        assert.match(fgToken('accent'), /^\x1b\[38;5;\d+m$/);
    });
    withEnvs({ NO_COLOR: undefined, FORCE_COLOR: '1' }, () => {
        assert.match(fgToken('accent'), /^\x1b\[(3\d|9\d)m$/);
    });
    withEnvs({ NO_COLOR: '1' }, () => {
        assert.equal(fgToken('accent'), '');
    });
});

test('light theme resolves different hexes', () => {
    withEnvs({ NO_COLOR: undefined, FORCE_COLOR: '3', JAW_TUI_THEME: 'light' }, () => {
        assert.equal(activeTheme(), 'light');
        assert.equal(fgToken('accent'), '\x1b[38;2;31;111;235m'); // #1f6feb
    });
});

test('paint in mono keeps attributes, drops color', () => {
    withEnvs({ NO_COLOR: '1' }, () => {
        assert.equal(paint('accent', 'x'), 'x');
        assert.equal(paint('accent', 'x', BOLD), `${BOLD}x${RESET}`);
    });
});
