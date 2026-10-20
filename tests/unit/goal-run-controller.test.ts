import { beforeEach, afterEach, test, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { GoalRunState } from '../../src/goal-run/types.js';

// Real controller and persisted JSON; isolate runtime/worker dependencies so
// restart recovery never needs a provider, database, or user's data home.
const home = mkdtempSync(join(tmpdir(), 'podex-goal-run-'));
const runPath = join(home, 'goal', 'active-run.json');
const controllerUrl = new URL('../../src/goal-run/controller.ts', import.meta.url).href;
let goal: { id: string; status: string; goalMode?: string } | null;
let orcState = 'IDLE';
let sequence = 0;
mock.module(new URL('../../src/core/config.ts', import.meta.url).href, {
    namedExports: { WEASLEY_PODEX_HOME: home },
});
mock.module(new URL('../../src/goal/store.ts', import.meta.url).href, {
    namedExports: { getActiveGoal: () => goal },
});
mock.module(new URL('../../src/orchestrator/state-machine.ts', import.meta.url).href, {
    namedExports: { getState: () => orcState },
});
mock.module(new URL('../../src/orchestrator/worker-registry.ts', import.meta.url).href, {
    namedExports: { getActiveWorkers: () => [], hasPendingWorkerReplays: () => false },
});

const now = Date.parse('2026-01-01T00:10:00.000Z');
let controller: typeof import('../../src/goal-run/controller.js');
function savedRun(status: 'running' | 'paused' = 'running'): GoalRunState {
    return {
        goalId: 'original-goal', mode: 'assist', status,
        budget: { maxTurns: 10, maxMinutes: 60, maxDispatches: 5, turnsUsed: 3, minutesUsed: 2, dispatchesUsed: 1 },
        gates: [], startedAt: new Date(now - 120_000).toISOString(),
        lastActiveAt: new Date(now - 60_000).toISOString(),
    };
}
function seed(run = savedRun()): void {
    fs.mkdirSync(join(home, 'goal'), { recursive: true });
    fs.writeFileSync(runPath, JSON.stringify(run));
}
function persisted(): GoalRunState {
    return JSON.parse(fs.readFileSync(runPath, 'utf8'));
}
beforeEach(async () => {
    fs.rmSync(runPath, { force: true });
    goal = { id: 'original-goal', status: 'active' };
    orcState = 'IDLE';
    mock.timers.enable({ apis: ['Date'], now });
    // A fresh module has no in-memory run, just like a restarted server.
    controller = await import(`${controllerUrl}?restart=${++sequence}`);
});
afterEach(() => { mock.timers.reset(); });

test('pause recovers a persisted run without a prior status read', () => {
    seed();
    assert.equal(controller.pauseRun()?.status, 'paused');
    assert.equal(persisted().budget.minutesUsed, 3);
});
test('resume recovers a persisted paused run without a prior status read', () => {
    seed(savedRun('paused'));
    assert.equal(controller.resumeRun()?.status, 'running');
    assert.equal(persisted().budget.minutesUsed, 2);
});
for (const action of ['stopRun', 'completeRun'] as const) {
    test(`${action} recovers and removes the persisted run after restart`, () => {
        seed();
        assert.equal(controller[action]()?.status, action === 'stopRun' ? 'stopped' : 'completed');
        assert.equal(fs.existsSync(runPath), false);
        assert.equal(controller.getActiveRun(), null);
    });
    test(`${action} does not charge paused time`, () => {
        seed(savedRun('paused'));
        controller.getActiveRun();
        mock.timers.tick(20 * 60_000);
        assert.equal(controller[action]()?.budget.minutesUsed, 2);
    });
}
test('turn and dispatch accounting recover persisted counters after restart', () => {
    seed();
    controller.recordTurn();
    mock.timers.tick(30_000);
    controller.recordDispatch();
    assert.deepEqual(persisted().budget, {
        maxTurns: 10, maxMinutes: 60, maxDispatches: 5,
        turnsUsed: 4, minutesUsed: 3.5, dispatchesUsed: 2,
    });
});
test('failure handling stops a persisted run after restart', () => {
    seed();
    assert.equal(controller.handleFailure('D', 'timeout').action, 'stop');
    assert.equal(fs.existsSync(runPath), false);
});
test('pause and resume exclude only the paused interval from tracked time', () => {
    seed();
    controller.getActiveRun();
    controller.pauseRun();
    mock.timers.tick(10 * 60_000);
    controller.resumeRun();
    mock.timers.tick(30_000);
    controller.recordDispatch();
    assert.equal(controller.stopRun()?.budget.minutesUsed, 3.5);
});
for (const status of ['running', 'paused'] as const) {
    test(`start cannot replace a persisted ${status} run or reset its budget`, () => {
        seed(savedRun(status));
        const before = fs.readFileSync(runPath, 'utf8');
        const result = controller.startRun('bounded');
        assert.equal(result.status, 'failed');
        assert.match(result.lastError!, /already exists/i);
        assert.equal(fs.readFileSync(runPath, 'utf8'), before);
    });
}
test('resume refuses a replacement goal and persists the failed gate', () => {
    seed(savedRun('paused'));
    goal = { id: 'replacement-goal', status: 'active' };
    controller.getActiveRun();
    const result = controller.resumeRun();
    assert.equal(result?.status, 'paused');
    assert.match(result?.lastError ?? '', /changed|match/i);
    assert.equal(persisted().lastError, result?.lastError);
    assert.equal(persisted().goalId, 'original-goal');
});
for (const unavailableGoal of [null, { id: 'original-goal', status: 'paused' }, { id: 'original-goal', status: 'active', goalMode: 'plan' }]) {
    test(`preflight rejects an unavailable execution goal: ${JSON.stringify(unavailableGoal)}`, () => {
        goal = unavailableGoal;
        assert.equal(controller.startRun().status, 'failed');
        assert.equal(fs.existsSync(runPath), false);
    });
}
test('failed resume persists diagnostics and successful retry clears the stale error', () => {
    seed(savedRun('paused'));
    controller.getActiveRun();
    orcState = 'B';
    const blocked = controller.resumeRun();
    assert.match(blocked?.lastError ?? '', /B phase/);
    assert.equal(persisted().lastError, blocked?.lastError);
    orcState = 'IDLE';
    assert.equal(controller.resumeRun()?.lastError, undefined);
    assert.equal(persisted().lastError, undefined);
    assert.equal(persisted().status, 'running');
});
test('paused run counters are not charged by unrelated lifecycle callbacks', () => {
    seed(savedRun('paused'));
    controller.recordTurn();
    controller.recordDispatch();
    assert.deepEqual(persisted().budget, savedRun('paused').budget);
});
