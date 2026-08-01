import test from 'node:test';
import assert from 'node:assert/strict';
import {
    composeHelpOntoFrame,
    composePaletteOntoFrame,
    composeSelectorOntoFrame,
} from '../../src/cli/tui/overlay.ts';

function stripAnsi(s: string): string {
    return s.replace(/\x1b\[[0-9;]*m/g, '');
}

test('composeHelpOntoFrame paints centered help box', () => {
    const rows = 24;
    const cols = 80;
    const frameRows = new Array(rows).fill('');
    composeHelpOntoFrame(frameRows, cols, rows, '\x1b[2m', '\x1b[0m');
    const joined = stripAnsi(frameRows.join('\n'));
    assert.ok(joined.includes('Help'), 'should contain Help title');
    assert.ok(joined.includes('Escape'), 'should contain dismiss hint');
    assert.ok(joined.includes('Ctrl+K'), 'should list Ctrl+K binding');
});

test('composePaletteOntoFrame paints commands with selection', () => {
    const rows = 24;
    const cols = 80;
    const frameRows = new Array(rows).fill('');
    composePaletteOntoFrame(
        frameRows, cols, rows, '\x1b[2m', '\x1b[0m',
        'qu',
        [
            { name: 'quit', desc: 'exit chat' },
            { name: 'queue', desc: 'queue task' },
        ],
        1,
    );
    const joined = stripAnsi(frameRows.join('\n'));
    assert.ok(joined.includes('Commands'), 'should contain Commands title');
    assert.ok(joined.includes('/quit'), 'should list /quit');
    assert.ok(frameRows.some((row) => row.includes('\x1b[7m')), 'selected row uses reverse video');
});

test('composeSelectorOntoFrame paints model picker', () => {
    const rows = 30;
    const cols = 80;
    const frameRows = new Array(rows).fill('');
    composeSelectorOntoFrame(
        frameRows, cols, rows, '\x1b[2m', '\x1b[0m',
        'Model',
        'cursor: gpt-4',
        '',
        [
            { value: 'gpt-4', label: 'default', current: true },
            { value: 'gpt-4o', label: 'fast', current: false },
        ],
        0,
    );
    const joined = stripAnsi(frameRows.join('\n'));
    assert.ok(joined.includes('Model'), 'should contain Model title');
    assert.ok(joined.includes('gpt-4'), 'should list gpt-4');
    assert.ok(joined.includes('●'), 'current item marked');
});
