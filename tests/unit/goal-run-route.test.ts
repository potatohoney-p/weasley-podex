import { beforeEach, test, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Request, Response, RequestHandler, Router } from 'express';
import type { GoalRunState } from '../../src/goal-run/types.js';

const home = fs.mkdtempSync(join(tmpdir(), 'podex-goal-run-route-'));
mock.module(new URL('../../src/core/config.ts', import.meta.url).href, {
    namedExports: { WEASLEY_PODEX_HOME: home },
});
mock.module(new URL('../../src/goal/store.ts', import.meta.url).href, {
    namedExports: { getActiveGoal: () => ({ id: 'route-goal', status: 'active' }) },
});
mock.module(new URL('../../src/orchestrator/state-machine.ts', import.meta.url).href, {
    namedExports: { getState: () => 'IDLE' },
});
mock.module(new URL('../../src/orchestrator/worker-registry.ts', import.meta.url).href, {
    namedExports: { getActiveWorkers: () => [], hasPendingWorkerReplays: () => false },
});
const controller = await import('../../src/goal-run/controller.js');
const { registerGoalRunRoutes } = await import('../../src/routes/goal-run.js');
let post: RequestHandler;
registerGoalRunRoutes({
    get() {},
    post(_path: string, _auth: RequestHandler, handler: RequestHandler) { post = handler; },
} as unknown as Router, (_req, _res, next) => next());
beforeEach(() => { controller.stopRun(); });

function resume() {
    const result: { status: number; body?: { ok: boolean; run?: GoalRunState } } = { status: 200 };
    const res = {
        status(code: number) { result.status = code; return res; },
        json(body: { ok: boolean; run?: GoalRunState }) { result.body = body; return res; },
    };
    post({ body: { action: 'resume' } } as Request, res as Response, () => {});
    return result;
}
test('API returns failure when a persisted paused run cannot pass its budget gate', () => {
    fs.mkdirSync(join(home, 'goal'), { recursive: true });
    const run: GoalRunState = {
        goalId: 'route-goal', mode: 'assist', status: 'paused', gates: [],
        budget: { maxTurns: 10, maxMinutes: 60, maxDispatches: 5, turnsUsed: 10, minutesUsed: 2, dispatchesUsed: 0 },
    };
    fs.writeFileSync(join(home, 'goal', 'active-run.json'), JSON.stringify(run));
    const result = resume();
    assert.equal(result.status, 400);
    assert.equal(result.body?.ok, false);
    assert.equal(result.body?.run?.status, 'paused');
    assert.match(result.body?.run?.lastError ?? '', /Budget exceeded/);
});
test('API reports success only after the paused run transitions to running', () => {
    controller.startRun();
    controller.pauseRun();
    const result = resume();
    assert.equal(result.status, 200);
    assert.equal(result.body?.ok, true);
    assert.equal(result.body?.run?.status, 'running');
});
test('API rejects resume when no run exists', () => {
    const result = resume();
    assert.equal(result.status, 400);
    assert.equal(result.body?.ok, false);
});
