import test from 'node:test';
import assert from 'node:assert/strict';
import { solveLayout } from '../../src/cli/tui/render/layout.ts';

test('solveLayout allocates transcript above fixed composer cluster', () => {
    const r = solveLayout(80, 24, 2);
    assert.equal(r.statusLine.height, 1);
    assert.equal(r.help.height, 1);
    assert.equal(r.composer.height, 2);
    assert.ok(r.transcript.height >= 1);
    assert.equal(r.transcript.y + r.transcript.height, r.statusLine.y);
    assert.equal(r.statusLine.y + 1, r.composer.y - 1);
    assert.equal(r.help.y, r.composer.y + r.composer.height + 1);
    assert.deepEqual(r.footer, r.statusLine);
});

test('solveLayout clamps composer height for tiny terminals', () => {
    const r = solveLayout(40, 8, 10);
    assert.ok(r.composer.height >= 1);
    assert.ok(r.transcript.height >= 1);
    assert.equal(r.statusLine.height, 1);
    assert.equal(r.help.height, 1);
});

test('solveLayout preserves numeric headerLines compatibility', () => {
    const r = solveLayout(80, 24, 1, 2);
    assert.equal(r.header.height, 2);
    assert.equal(r.header.y, 1);
    assert.equal(r.transcript.y, 3);
    assert.equal(r.commandSurface.height, 0);
});

test('solveLayout allocates command surface between status and composer', () => {
    const r = solveLayout(80, 24, 1, { commandSurfaceLines: 3 });
    assert.equal(r.commandSurface.height, 3);
    assert.equal(r.commandSurface.y, r.statusLine.y + r.statusLine.height);
    assert.equal(r.composer.y, r.commandSurface.y + r.commandSurface.height + 1);
    assert.equal(r.help.y, r.composer.y + r.composer.height + 1);
    assert.ok(r.transcript.height >= 1);
});

test('solveLayout supports header and command surface together', () => {
    const r = solveLayout(80, 12, 1, { headerLines: 2, commandSurfaceLines: 3 });
    assert.equal(r.header.height, 2);
    assert.ok(r.commandSurface.height >= 0);
    assert.ok(r.transcript.height >= 1);
    assert.equal(r.footer, r.statusLine);
});
