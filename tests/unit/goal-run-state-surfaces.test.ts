import { after, beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Request, Response, RequestHandler, Router } from 'express';

const home = fs.mkdtempSync(join(tmpdir(), 'podex-run-surfaces-'));
const runPath = join(home, 'goal', 'active-run.json');
mock.module(new URL('../../src/core/config.ts', import.meta.url).href, {
    namedExports: { WEASLEY_PODEX_HOME: home, settings: {} },
});
mock.module(new URL('../../src/goal/store.ts', import.meta.url).href, {
    namedExports: { getActiveGoal: () => ({ id: 'goal', status: 'active' }) },
});
mock.module(new URL('../../src/orchestrator/state-machine.ts', import.meta.url).href, { namedExports: { getState: () => 'IDLE' } });
mock.module(new URL('../../src/orchestrator/worker-registry.ts', import.meta.url).href, {
    namedExports: { getActiveWorkers: () => [], hasPendingWorkerReplays: () => false },
});
mock.module(new URL('../../src/agent/lifecycle-handler.ts', import.meta.url).href, { namedExports: { clearGoalTimers: () => {} } });
const controller = await import('../../src/goal-run/controller.js');
const { registerGoalRunRoutes } = await import('../../src/routes/goal-run.js');
const { goalWorkflowHandler } = await import('../../src/cli/handlers-workflows.js');
const handlers = new Map<string, RequestHandler>();
registerGoalRunRoutes({
    get(path: string, _auth: RequestHandler, handler: RequestHandler) { handlers.set(`GET ${path}`, handler); },
    post(path: string, _auth: RequestHandler, handler: RequestHandler) { handlers.set(`POST ${path}`, handler); },
} as unknown as Router, (_req, _res, next) => next());

beforeEach(() => {
    fs.mkdirSync(join(home, 'goal'), { recursive: true });
    fs.rmSync(runPath, { recursive: true, force: true });
    controller.stopRun();
});
after(() => fs.rmSync(home, { recursive: true, force: true }));

function request(method: 'GET' | 'POST', body?: object, path = '/api/goal-run') {
    const result: { status: number; body?: Record<string, unknown> } = { status: 200 };
    const res = {
        status(status: number) { result.status = status; return res; },
        json(value: Record<string, unknown>) { result.body = value; return res; },
    };
    handlers.get(`${method} ${path}`)!({ body, query: {} } as Request, res as Response, () => {});
    return result;
}

test('status and every explicit API mutation report recoverable conflicts without touching invalid bytes', () => {
    const raw = '{"secret":"private-sentinel",';
    fs.writeFileSync(runPath, raw);
    const results = [request('GET'), ...['start', 'pause', 'resume', 'stop', 'complete'].map(action => request('POST', { action, confirm: true }))];
    for (const result of results) {
        assert.equal(result.status, 409);
        assert.equal(result.body?.['ok'], false);
        assert.equal(result.body?.['code'], 'goal_run_state_invalid');
        assert.match(String(result.body?.['error']), /active-run\.json.*backup.*repair.*retry/i);
        assert.doesNotMatch(JSON.stringify(result.body), /private-sentinel|secret/);
    }
    assert.equal(fs.readFileSync(runPath, 'utf8'), raw);
    fs.writeFileSync(runPath, JSON.stringify({
        goalId: 'goal', mode: 'assist', status: 'paused', gates: [],
        budget: { maxTurns: 10, maxMinutes: 60, maxDispatches: 5, turnsUsed: 0, minutesUsed: 0, dispatchesUsed: 0 },
    }));
    assert.equal(request('GET').body?.['ok'], true);
    assert.equal(request('POST', { action: 'resume' }).status, 200);
});

test('GET and POST preflight disclose the persisted-state gate without treating the file as absent', () => {
    fs.writeFileSync(runPath, '{');
    for (const result of [request('GET', undefined, '/api/goal-run/preflight'), request('POST', { action: 'preflight' })]) {
        assert.equal(result.status, 200);
        assert.match(JSON.stringify(result.body?.['gates']), /persisted-run-state.*false/);
    }
    assert.equal(fs.readFileSync(runPath, 'utf8'), '{');
});

test('CLI run commands return actionable blocked results and preserve the original file', async () => {
    const raw = '{"secret":"private-sentinel",';
    fs.writeFileSync(runPath, raw);
    for (const action of ['status', 'start', 'stop', 'cancel']) {
        const result = await goalWorkflowHandler(['run', action], { interface: 'cli', locale: 'en' });
        assert.equal(result.ok, false);
        assert.equal(result.code, 'goal_run_state_invalid');
        assert.match(result.text ?? '', /active-run\.json.*backup.*repair.*retry/i);
        assert.doesNotMatch(result.text ?? '', /private-sentinel|secret/);
        assert.equal(fs.readFileSync(runPath, 'utf8'), raw);
    }
    const preflight = await goalWorkflowHandler(['run', 'preflight'], { interface: 'cli', locale: 'en' });
    assert.match(preflight.text ?? '', /NOT READY.*\n.*|persisted-run-state/);
    assert.match(preflight.text ?? '', /FAIL persisted-run-state/);
});

test('unreadable saved state is reported distinctly and is not replaced', () => {
    fs.mkdirSync(runPath);
    for (const result of [request('GET'), request('POST', { action: 'start' })]) {
        assert.equal(result.status, 409);
        assert.equal(result.body?.['code'], 'goal_run_state_unreadable');
        assert.match(String(result.body?.['error']), /could not be read/);
    }
    assert.equal(fs.statSync(runPath).isDirectory(), true);
});
