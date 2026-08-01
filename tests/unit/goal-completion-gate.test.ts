import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setGoal, updateGoal, getActiveGoal, goalHasCompletionEvidence, resetGoalStore } from '../../src/goal/store.js';

test('updateGoal stores evidence and the gate accepts it', () => {
    resetGoalStore();
    setGoal('gate test goal', { replace: true });
    const updated = updateGoal('did work', '', ['npm test 3/3', 'src/x.ts']);
    assert.equal(updated?.lastCheckpoint?.evidencePaths.length, 2);
    assert.equal(goalHasCompletionEvidence(getActiveGoal()), true);
    resetGoalStore();
});

test('gate rejects when latest checkpoint has no evidence', () => {
    resetGoalStore();
    setGoal('gate test goal 2', { replace: true });
    updateGoal('did work, no evidence');
    assert.equal(goalHasCompletionEvidence(getActiveGoal()), false);
    resetGoalStore();
});

test('gate rejects when there are zero checkpoints', () => {
    resetGoalStore();
    const g = setGoal('gate test goal 3', { replace: true });
    assert.equal(goalHasCompletionEvidence(g), false);
    resetGoalStore();
});

test('gate is false for a null goal', () => {
    assert.equal(goalHasCompletionEvidence(null), false);
});

test('gate rejects blank/whitespace-only evidence entries (no false satisfy via direct API)', () => {
    resetGoalStore();
    setGoal('gate test goal 4', { replace: true });
    updateGoal('blank evidence', '', ['   ', '']);
    assert.equal(goalHasCompletionEvidence(getActiveGoal()), false);
    resetGoalStore();
});
