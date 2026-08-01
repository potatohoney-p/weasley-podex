import test from 'node:test';
import assert from 'node:assert/strict';
import { composeComposerBox, measureComposerVisualRows } from '../../src/cli/tui/render/composer-box.ts';
import { visualWidth } from '../../src/cli/tui/renderers.ts';

const theme = {
    dimCode: '\x1b[2m',
    resetCode: '\x1b[0m',
    accentCode: '\x1b[36m',
    boldCode: '\x1b[1m',
    border: {
        topLeft: '┌',
        topRight: '┐',
        bottomLeft: '└',
        bottomRight: '┘',
        horizontal: '─',
        vertical: '│',
    },
};

function stripAnsi(text: string): string {
    return text.replace(/\x1b\[[0-9;]*m/g, '');
}

test('composer box keeps prompt, typed text, and cursor in distinct cells', () => {
    const box = composeComposerBox('E', 1, 40, 1, theme);
    const input = stripAnsi(box.rows[1] ?? '');

    assert.match(input, /^│ > E/);
    assert.equal(box.cursor.row, 0);
    assert.equal(box.cursor.col, 5);
    assert.ok(box.cursor.col > input.indexOf('>'));
    assert.ok(box.rows.every(row => !row.includes('\n')));
    assert.ok(box.rows.every(row => visualWidth(row) <= 40));
});

test('composer box accounts for wide glyphs before placing cursor', () => {
    const box = composeComposerBox('한🙂a', 3, 40, 1, theme);
    const input = stripAnsi(box.rows[1] ?? '');

    assert.match(input, /한🙂a/);
    assert.equal(box.cursor.row, 0);
    assert.equal(box.cursor.col, 9);
    assert.ok(box.rows.every(row => visualWidth(row) <= 40));
});

test('composer box scrolls the visible input window without growing past terminal cluster height', () => {
    const text = 'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda';
    const measured = measureComposerVisualRows(text, text.length, 24);
    const box = composeComposerBox(text, text.length, 24, 2, theme);

    assert.ok(measured > 2);
    assert.equal(box.rows.length, 4); // top border + 2 input rows + bottom border
    assert.equal(box.cursor.row, 1);
    assert.ok(box.visibleRowStart > 0);
    assert.ok(box.rows.every(row => !row.includes('\n')));
    assert.ok(box.rows.every(row => visualWidth(row) <= 24));
});
