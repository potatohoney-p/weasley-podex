import test from 'node:test';
import assert from 'node:assert/strict';
import { createAutocompleteState } from '../../src/cli/tui/overlay.ts';
import { composeSlashSurfaceLines } from '../../src/cli/tui/slash-surface.ts';

const opts = {
    columns: 80,
    dimCode: '\x1b[2m',
    resetCode: '\x1b[0m',
    clipTextToCols: (text: string, maxCols: number) => text.slice(0, maxCols),
};

test('composeSlashSurfaceLines renders command names and descriptions', () => {
    const state = createAutocompleteState();
    state.open = true;
    state.stage = 'command';
    state.items = [
        { name: 'settings', desc: 'Open settings' },
        { name: 'model', desc: 'Switch model' },
    ];
    state.visibleRows = 2;
    state.selected = 0;

    const lines = composeSlashSurfaceLines(state, opts);
    assert.equal(lines.length, 2);
    assert.match(lines[0] ?? '', /\/settings/);
    assert.match(lines[0] ?? '', /Open settings/);
    assert.match(lines[0] ?? '', /\x1b\[7m/);
    assert.match(lines[1] ?? '', /\/model/);
});

test('composeSlashSurfaceLines includes count row for clipped windows', () => {
    const state = createAutocompleteState();
    state.open = true;
    state.stage = 'command';
    state.items = [
        { name: 'a' },
        { name: 'b' },
        { name: 'c' },
    ];
    state.visibleRows = 2;
    state.selected = 1;

    const lines = composeSlashSurfaceLines(state, opts);
    assert.match(lines[2] ?? '', /\(2\/3\)/);
});

test('composeSlashSurfaceLines preserves argument context header', () => {
    const state = createAutocompleteState();
    state.open = true;
    state.stage = 'argument';
    state.contextHeader = 'model ▸ pick model';
    state.items = [{ name: 'gpt-5.4', commandDesc: 'pick model' }];
    state.visibleRows = 1;

    const lines = composeSlashSurfaceLines(state, opts);
    assert.match(lines[0] ?? '', /model ▸ pick model/);
    assert.match(lines[1] ?? '', /gpt-5.4/);
});

test('composeSlashSurfaceLines is frame safe', () => {
    const state = createAutocompleteState();
    state.open = true;
    state.stage = 'command';
    state.items = [{ name: 'settings', desc: 'Open\nsettings' }];
    state.visibleRows = 1;

    const lines = composeSlashSurfaceLines(state, opts);
    assert.ok(lines.length > 0);
    assert.equal(lines.some(line => line.includes('\n')), false);
    assert.equal(lines.some(line => /\x1b\[[0-9]+[ABCD]/.test(line)), false);
});
