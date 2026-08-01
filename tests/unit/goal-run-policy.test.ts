import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { checkPreflightGates, allGatesPassed, checkBudget } from '../../src/goal-run/policy.ts';

describe('Goal Run Policy', () => {
    test('1. all gates pass with clean state', () => {
        const gates = checkPreflightGates({ hasGoal: true, orcState: 'IDLE', workerBusy: false, pendingReplay: false });
        assert.ok(allGatesPassed(gates));
        assert.equal(gates.length, 4);
    });

    test('2. no goal fails active-goal gate', () => {
        const gates = checkPreflightGates({ hasGoal: false, orcState: 'IDLE', workerBusy: false, pendingReplay: false });
        assert.ok(!allGatesPassed(gates));
        const goalGate = gates.find(g => g.gate === 'active-goal');
        assert.ok(goalGate);
        assert.equal(goalGate!.passed, false);
    });

    test('3. active PABCD fails idle-state gate', () => {
        const gates = checkPreflightGates({ hasGoal: true, orcState: 'B', workerBusy: false, pendingReplay: false });
        assert.ok(!allGatesPassed(gates));
        const stateGate = gates.find(g => g.gate === 'idle-state');
        assert.equal(stateGate!.passed, false);
    });

    test('4. busy worker fails gate', () => {
        const gates = checkPreflightGates({ hasGoal: true, orcState: 'IDLE', workerBusy: true, pendingReplay: false });
        const workerGate = gates.find(g => g.gate === 'no-busy-worker');
        assert.equal(workerGate!.passed, false);
    });

    test('5. pending replay fails gate', () => {
        const gates = checkPreflightGates({ hasGoal: true, orcState: 'IDLE', workerBusy: false, pendingReplay: true });
        const replayGate = gates.find(g => g.gate === 'no-pending-replay');
        assert.equal(replayGate!.passed, false);
    });

    test('6. budget within limits passes', () => {
        const gate = checkBudget({ maxTurns: 10, maxMinutes: 60, maxDispatches: 5, turnsUsed: 3, minutesUsed: 15, dispatchesUsed: 1 });
        assert.equal(gate.passed, true);
    });

    test('7. budget exceeded fails', () => {
        const gate = checkBudget({ maxTurns: 5, maxMinutes: 60, maxDispatches: 5, turnsUsed: 5, minutesUsed: 10, dispatchesUsed: 1 });
        assert.equal(gate.passed, false);
        assert.ok(gate.reason!.includes('turns'));
    });
});
