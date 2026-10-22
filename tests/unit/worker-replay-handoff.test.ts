import test from 'node:test';
import assert from 'node:assert/strict';
import {
    claimWorker, finishWorker, failWorker,
    claimWorkerReplay, markWorkerReplayed, releaseWorkerReplay,
    listPendingWorkerResults, getActiveWorkers, getWorkerSlot,
} from '../../src/orchestrator/worker-registry.js';

// ─── Helpers ─────────────────────────────────────────
const fakeEmp = (id: string) => ({ id, name: `test-${id}`, cli: 'claude' });

function setupFinishedWorker(id: string): void {
    claimWorker(fakeEmp(id), 'test task');
    finishWorker(id, `result-${id}`);
}

// ─── Tests ───────────────────────────────────────────

test('WRH-001: finished worker result is injected exactly once', () => {
    const id = `wrh1-${Date.now()}`;
    setupFinishedWorker(id);

    // First claim succeeds
    assert.ok(claimWorkerReplay(id), 'first claim should succeed');
    // Second claim fails (already claimed)
    assert.ok(!claimWorkerReplay(id), 'second claim should fail — replay already claimed');

    markWorkerReplayed(id);
    // After marking replayed, claim should also fail
    assert.ok(!claimWorkerReplay(id), 'claim after replayed should fail');
});

test('WRH-002: failed reinjection releases replay claim and leaves replay pending', () => {
    const id = `wrh2-${Date.now()}`;
    setupFinishedWorker(id);

    assert.ok(claimWorkerReplay(id), 'claim should succeed');
    // Simulate failure — release the claim
    releaseWorkerReplay(id);

    // Replay should still be pending and claimable
    const pending = listPendingWorkerResults();
    const found = pending.some(p => p.agentId === id);
    assert.ok(found, 'released replay should remain in pending list');

    // Re-claim should succeed after release
    assert.ok(claimWorkerReplay(id), 're-claim after release should succeed');
    markWorkerReplayed(id);
});

test('WRH-003: replay drain picks up pending results from prior workers', () => {
    const id1 = `wrh3a-${Date.now()}`;
    const id2 = `wrh3b-${Date.now()}`;
    setupFinishedWorker(id1);
    setupFinishedWorker(id2);

    const pending = listPendingWorkerResults();
    const ids = pending.map(p => p.agentId);
    assert.ok(ids.includes(id1), 'worker 1 should be in pending list');
    assert.ok(ids.includes(id2), 'worker 2 should be in pending list');

    // Drain: claim and mark each
    for (const pr of pending) {
        if (pr.agentId === id1 || pr.agentId === id2) {
            assert.ok(claimWorkerReplay(pr.agentId));
            markWorkerReplayed(pr.agentId);
        }
    }

    // Both should be gone from pending
    const after = listPendingWorkerResults();
    assert.ok(!after.some(p => p.agentId === id1), 'worker 1 should no longer be pending');
    assert.ok(!after.some(p => p.agentId === id2), 'worker 2 should no longer be pending');
});

test('WRH-004: pending replay entries include run identity and safe metadata', () => {
    const id = `wrh4-${Date.now()}`;
    claimWorker(fakeEmp(id), 'sensitive full task with safe preview');
    finishWorker(id, `result-${id}`);

    const pending = listPendingWorkerResults().find(p => p.agentId === id);
    assert.ok(pending, 'worker should be in pending list');
    assert.ok(pending.runId.startsWith('wr_'), 'pending replay must carry runId recovery identity');
    assert.equal(pending.employeeName, `test-${id}`);
    assert.equal(pending.taskPreview.includes('safe preview'), true);
    markWorkerReplayed(id);
});

test('WRH-005: stale replay claims cannot claim a replacement run', () => {
    const id = `wrh5-${Date.now()}`;
    const first = claimWorker(fakeEmp(id), 'first task');
    finishWorker(id, 'first result');
    const second = claimWorker(fakeEmp(id), 'second task');
    finishWorker(id, 'second result');

    assert.equal(claimWorkerReplay(id, first.runId), false);
    assert.equal(second.replayClaimed, false);
    assert.equal(claimWorkerReplay(id, second.runId), true);
    markWorkerReplayed(id, second.runId);
});

for (const replacementState of ['running', 'done'] as const) {
    test(`WRH-006: stale replay acknowledgement preserves a ${replacementState} replacement`, () => {
        const id = `wrh6-${replacementState}-${Date.now()}`;
        const first = claimWorker(fakeEmp(id), 'first task');
        finishWorker(id, 'first result');
        assert.equal(claimWorkerReplay(id, first.runId), true);
        const second = claimWorker(fakeEmp(id), 'second task');
        if (replacementState === 'done') {
            finishWorker(id, 'second result');
            assert.equal(claimWorkerReplay(id, second.runId), true);
        }
        const before = { ...second };

        markWorkerReplayed(id, first.runId);

        assert.equal(getWorkerSlot(id), second);
        assert.deepEqual(second, before);
        if (replacementState === 'running') finishWorker(id, 'second result');
        markWorkerReplayed(id, second.runId);
    });

    test(`WRH-007: stale replay failures preserve a ${replacementState} replacement`, () => {
        const id = `wrh7-${replacementState}-${Date.now()}`;
        const first = claimWorker(fakeEmp(id), 'first task');
        finishWorker(id, 'first result');
        assert.equal(claimWorkerReplay(id, first.runId), true);
        const second = claimWorker(fakeEmp(id), 'second task');
        if (replacementState === 'done') {
            finishWorker(id, 'second result');
            assert.equal(claimWorkerReplay(id, second.runId), true);
        }
        const before = { ...second };

        for (let attempt = 0; attempt < 3; attempt++) releaseWorkerReplay(id, first.runId);

        assert.equal(getWorkerSlot(id), second);
        assert.deepEqual(second, before);
        if (replacementState === 'running') finishWorker(id, 'second result');
        markWorkerReplayed(id, second.runId);
    });
}

test('WRH-008: matching run identity preserves retry and acknowledgement behavior', () => {
    const id = `wrh8-${Date.now()}`;
    const slot = claimWorker(fakeEmp(id), 'test task');
    finishWorker(id, 'test result');

    assert.equal(claimWorkerReplay(id, ''), false);
    assert.equal(claimWorkerReplay(id, slot.runId), true);
    assert.equal(claimWorkerReplay(id, slot.runId), false);
    releaseWorkerReplay(id, slot.runId);
    assert.equal(slot.replayAttempts, 1);
    assert.equal(slot.replayClaimed, false);
    assert.equal(slot.pendingReplay, true);
    assert.equal(claimWorkerReplay(id, slot.runId), true);
    markWorkerReplayed(id, slot.runId);
    assert.equal(getWorkerSlot(id), undefined);
    assert.equal(claimWorkerReplay(id, slot.runId), false);
});
