import test from 'node:test';
import assert from 'node:assert/strict';
import { diffFrames, type Frame } from '../../src/cli/tui/render/frame.ts';

test('diffFrames writes all rows on first paint', () => {
    const next: Frame = { rows: ['a', 'b'] };
    const patch = diffFrames(null, next);
    assert.ok(patch.includes('a'));
    assert.ok(patch.includes('b'));
});

test('diffFrames skips unchanged rows', () => {
    const prev: Frame = { rows: ['same', 'old'] };
    const next: Frame = { rows: ['same', 'new'] };
    const patch = diffFrames(prev, next);
    assert.ok(!patch.includes('same'));
    assert.ok(patch.includes('new'));
});
