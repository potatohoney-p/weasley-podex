import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSgrMouse, isMouseSequence } from '../../src/cli/tui/render/mouse.ts';

test('parseSgrMouse wheel up/down', () => {
    const up = parseSgrMouse('\x1b[<64;10;5M');
    assert.ok(up);
    assert.equal(up!.event.kind, 'wheel-up');
    assert.equal(up!.event.col, 10);
    assert.equal(up!.event.row, 5);

    const down = parseSgrMouse('\x1b[<65;10;5M');
    assert.ok(down);
    assert.equal(down!.event.kind, 'wheel-down');
});

test('isMouseSequence detects SGR prefix', () => {
    assert.equal(isMouseSequence('\x1b[<64;1;1M'), true);
    assert.equal(isMouseSequence('\x1b[A'), false);
});
