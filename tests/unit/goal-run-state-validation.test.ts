import { after, afterEach, beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { GoalRunState } from '../../src/goal-run/types.js';

const home = fs.mkdtempSync(join(tmpdir(), 'podex-run-validation-'));
const runPath = join(home, 'goal', 'active-run.json');
const controllerUrl = new URL('../../src/goal-run/controller.ts', import.meta.url).href;
mock.module(new URL('../../src/core/config.ts', import.meta.url).href, { namedExports: { WEASLEY_PODEX_HOME: home } });
mock.module(new URL('../../src/goal/store.ts', import.meta.url).href, { namedExports: { getActiveGoal: () => ({ id: 'goal', status: 'active' }) } });
mock.module(new URL('../../src/orchestrator/state-machine.ts', import.meta.url).href, { namedExports: { getState: () => 'IDLE' } });
mock.module(new URL('../../src/orchestrator/worker-registry.ts', import.meta.url).href, {
    namedExports: { getActiveWorkers: () => [], hasPendingWorkerReplays: () => false },
});
let sequence = 0;
let controller: typeof import('../../src/goal-run/controller.js');
const warnings: string[] = [];
let restoreWarnings: () => void;
function validRun(): GoalRunState {
    return {
        goalId: 'goal', status: 'paused', mode: 'assist', gates: [],
        budget: { maxTurns: 10, maxMinutes: 60, maxDispatches: 5, turnsUsed: 3, minutesUsed: 2.5, dispatchesUsed: 1 },
    };
}
function seed(raw: string) { fs.writeFileSync(runPath, raw); }
function assertStateError(action: () => unknown, field: RegExp) {
    assert.throws(action, (error: unknown) => {
        assert.equal((error as { code: string }).code, 'goal_run_state_invalid');
        assert.equal((error as { statusCode: number }).statusCode, 409);
        assert.match((error as Error).message, field);
        assert.match((error as Error).message, /active-run\.json.*backup.*repair.*retry/i);
        return true;
    });
}
beforeEach(async () => {
    fs.mkdirSync(join(home, 'goal'), { recursive: true });
    fs.rmSync(runPath, { recursive: true, force: true });
    warnings.length = 0;
    const warning = mock.method(console, 'warn', (...args: unknown[]) => { warnings.push(args.join(' ')); });
    restoreWarnings = () => warning.mock.restore();
    controller = await import(`${controllerUrl}?validation=${++sequence}`);
});
afterEach(() => restoreWarnings());
after(() => fs.rmSync(home, { recursive: true, force: true }));

const invalidRecords: [string, unknown, RegExp][] = [
    ['null root', null, /object/i],
    ['array root', [], /object/i],
    ['missing budget', { ...validRun(), budget: undefined }, /budget/],
    ['string usage', { ...validRun(), budget: { ...validRun().budget, turnsUsed: '3' } }, /budget\.turnsUsed/],
    ['negative usage', { ...validRun(), budget: { ...validRun().budget, minutesUsed: -1 } }, /budget\.minutesUsed/],
    ['fractional turns', { ...validRun(), budget: { ...validRun().budget, maxTurns: 1.5 } }, /budget\.maxTurns/],
    ['unsafe dispatch count', { ...validRun(), budget: { ...validRun().budget, dispatchesUsed: Number.MAX_SAFE_INTEGER + 1 } }, /budget\.dispatchesUsed/],
    ['null limit', { ...validRun(), budget: { ...validRun().budget, maxMinutes: null } }, /budget\.maxMinutes/],
    ['unknown mode', { ...validRun(), mode: 'secret-invalid-mode' }, /mode/],
    ['array mode', { ...validRun(), mode: ['assist'] }, /mode/],
    ['unknown status', { ...validRun(), status: 'secret-invalid-status' }, /status/],
    ['empty goal', { ...validRun(), goalId: '' }, /goalId/],
    ['missing gates', { ...validRun(), gates: undefined }, /gates/],
    ['invalid gate', { ...validRun(), gates: [{ gate: 'budget', passed: 'yes' }] }, /gates\[0\]\.passed/],
    ['invalid gate reason', { ...validRun(), gates: [{ gate: 'budget', passed: false, reason: {} }] }, /gates\[0\]\.reason/],
    ['invalid timestamp', { ...validRun(), lastActiveAt: 'secret-bad-date' }, /lastActiveAt/],
    ['null timestamp', { ...validRun(), startedAt: null }, /startedAt/],
    ['invalid last error', { ...validRun(), lastError: {} }, /lastError/],
];
for (const [name, value, field] of invalidRecords) {
    test(`rejects ${name} without returning invalid state or changing saved bytes`, () => {
        const raw = JSON.stringify(value);
        seed(raw);
        assertStateError(() => controller.getActiveRun(), field);
        assert.equal(fs.readFileSync(runPath, 'utf8'), raw);
    });
}
test('rejects non-finite overflow parsed from otherwise valid JSON', () => {
    const raw = JSON.stringify(validRun()).replace('"maxMinutes":60', '"maxMinutes":1e309');
    seed(raw);
    assertStateError(() => controller.resumeRun(), /budget\.maxMinutes/);
    assert.equal(fs.readFileSync(runPath, 'utf8'), raw);
});
for (const action of ['getActiveRun', 'startRun', 'pauseRun', 'resumeRun', 'stopRun', 'completeRun'] as const) {
    test(`${action} preserves malformed JSON and reports recovery guidance`, () => {
        const raw = '{\n  "secret": "private-sentinel",\n';
        seed(raw);
        assertStateError(() => controller[action](), /JSON/);
        assert.equal(fs.readFileSync(runPath, 'utf8'), raw);
    });
}
test('preflight exposes rejected persisted state without modifying it', () => {
    const raw = '{"status":"running"}';
    seed(raw);
    const result = controller.preflight();
    assert.ok(result.gates.some(g => g.gate === 'persisted-run-state' && !g.passed));
    assert.equal(fs.readFileSync(runPath, 'utf8'), raw);
});
test('tracking and failure callbacks leave invalid bytes intact without interrupting callers', () => {
    const raw = '{"status":"running","secret":"private-sentinel"}';
    seed(raw);
    assert.doesNotThrow(() => controller.recordTurn());
    assert.doesNotThrow(() => controller.recordDispatch());
    assert.equal(controller.handleFailure('D', 'timeout').action, 'stop');
    assert.equal(fs.readFileSync(runPath, 'utf8'), raw);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0]!, /active-run\.json/);
    assert.doesNotMatch(warnings.join(' '), /private-sentinel|secret/);
});
test('a repaired file is loaded on the next attempt without a process restart', () => {
    seed('{');
    assertStateError(() => controller.getActiveRun(), /JSON/);
    const repaired = { ...validRun(), futureMetadata: { source: 'retained' } };
    seed(JSON.stringify(repaired));
    assert.deepEqual(controller.getActiveRun(), repaired);
    assert.equal(controller.resumeRun()?.status, 'running');
    assert.deepEqual(JSON.parse(fs.readFileSync(runPath, 'utf8')).futureMetadata, repaired.futureMetadata);
});
test('valid exhausted budgets and optional legacy timestamps retain existing behavior', () => {
    const run = validRun();
    run.budget.maxTurns = 0;
    run.budget.turnsUsed = 10;
    run.startedAt = '2026-01-01T00:00:00Z';
    run.lastActiveAt = '2026-01-01T00:00:00+00:00';
    seed(JSON.stringify(run));
    assert.deepEqual(controller.getActiveRun(), run);
    assert.equal(controller.resumeRun()?.status, 'paused');
    assert.match(controller.getActiveRun()?.lastError ?? '', /Budget exceeded/);
});
test('an absent file remains a normal fresh start', () => {
    assert.equal(controller.getActiveRun(), null);
    assert.equal(controller.startRun().status, 'running');
});

for (const [action, counter] of [['recordTurn', 'turnsUsed'], ['recordDispatch', 'dispatchesUsed']] as const) {
    test(`${action} preserves a valid exhausted safe-integer boundary without writing overflow`, async () => {
        const run = validRun();
        run.status = 'running';
        run.budget[counter] = Number.MAX_SAFE_INTEGER;
        run.lastActiveAt = '2026-01-01T00:00:00Z';
        const raw = JSON.stringify(run);
        seed(raw);
        assert.doesNotThrow(() => { controller[action](); controller[action](); });
        assert.equal(fs.readFileSync(runPath, 'utf8'), raw);
        assert.equal(warnings.length, 1);
        assert.match(warnings[0]!, new RegExp(`${counter}.*safe integer`));
        const restarted = await import(`${controllerUrl}?validation=${++sequence}`);
        assert.deepEqual(restarted.getActiveRun(), run);
    });
}

test('a dangling saved-run link is unreadable state rather than an absent run', () => {
    const target = join(home, 'missing-run.json');
    fs.symlinkSync(target, runPath, 'file');
    for (const action of ['getActiveRun', 'startRun', 'pauseRun', 'resumeRun', 'stopRun', 'completeRun'] as const) {
        assert.throws(() => controller[action](), { code: 'goal_run_state_unreadable', statusCode: 409 });
        assert.equal(fs.lstatSync(runPath).isSymbolicLink(), true);
        assert.equal(fs.readlinkSync(runPath), target);
    }
    assert.doesNotThrow(() => controller.recordTurn());
    assert.doesNotThrow(() => controller.recordDispatch());
    assert.equal(fs.lstatSync(runPath).isSymbolicLink(), true);
    assert.equal(fs.existsSync(`${runPath}.tmp`), false);
});
