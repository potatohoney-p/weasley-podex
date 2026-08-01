import { readSource } from './source-normalize.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

const __dirname = import.meta.dirname;
const projectRoot = join(__dirname, '../..');

const runtimeSrc = readSource(join(projectRoot, 'src/goal/runtime.ts'), 'utf8');
const eventsSrc = readSource(join(projectRoot, 'src/goal-run/events.ts'), 'utf8');
const guardsSrc = readSource(join(projectRoot, 'src/workflows/runtime-guards.ts'), 'utf8');

const SDK_DENYLIST = ['openai', '@anthropic-ai/sdk', '@google/generative-ai', 'ai', '@ai-sdk/'];

test('GRL-001: goal runtime has no SDK imports', () => {
    for (const sdk of SDK_DENYLIST) {
        assert.ok(!runtimeSrc.includes(`from '${sdk}`), `must not import ${sdk}`);
    }
});

test('GRL-002: goal-run events has no SDK imports', () => {
    for (const sdk of SDK_DENYLIST) {
        assert.ok(!eventsSrc.includes(`from '${sdk}`), `must not import ${sdk}`);
    }
});

test('GRL-003: runtime-guards has no SDK imports', () => {
    for (const sdk of SDK_DENYLIST) {
        assert.ok(!guardsSrc.includes(`from '${sdk}`), `must not import ${sdk}`);
    }
});

test('GRL-004: runtime snapshot distinguishes activeWorkers and pendingWorkerReplays', () => {
    assert.ok(runtimeSrc.includes('activeWorkers'), 'must have activeWorkers');
    assert.ok(runtimeSrc.includes('pendingWorkerReplays'), 'must have pendingWorkerReplays');
});

test('GRL-005: runtime snapshot distinguishes heartbeat from worker state', () => {
    assert.ok(runtimeSrc.includes('heartbeatBusy'), 'must have heartbeatBusy');
    assert.ok(runtimeSrc.includes('heartbeatPendingJobs'), 'must have heartbeatPendingJobs');
});

test('GRL-006: goal-run events use createWorkflowEvent', () => {
    assert.ok(eventsSrc.includes('createWorkflowEvent'), 'must use workflow event factory');
});

test('GRL-007: goal-run events cover all lifecycle stages', () => {
    assert.ok(eventsSrc.includes('goal-run'), 'must emit goal-run events');
    assert.ok(eventsSrc.includes('guard'), 'must emit guard events');
    assert.ok(eventsSrc.includes('handoff'), 'must emit handoff events');
    assert.ok(eventsSrc.includes('checkpoint'), 'must emit checkpoint events');
});

test('GRL-008: runtime guards check idle state', () => {
    assert.ok(guardsSrc.includes('guardIdleState'), 'must have idle guard');
    assert.ok(guardsSrc.includes('not-idle'), 'must block non-idle');
});

test('GRL-009: runtime guards check budget remaining', () => {
    assert.ok(guardsSrc.includes('guardBudgetRemaining'), 'must have budget guard');
    assert.ok(guardsSrc.includes('budget-turns'), 'must check turns');
    assert.ok(guardsSrc.includes('budget-minutes'), 'must check minutes');
    assert.ok(guardsSrc.includes('budget-dispatches'), 'must check dispatches');
});

test('GRL-010: runtime guards prohibit force', () => {
    assert.ok(guardsSrc.includes('guardNoForce'), 'must have force guard');
    assert.ok(guardsSrc.includes('force-forbidden'), 'must block force');
});

test('GRL-011: runtime snapshot includes budget field', () => {
    assert.ok(runtimeSrc.includes('budget'), 'snapshot must include budget');
    assert.ok(runtimeSrc.includes('GoalRunBudget'), 'budget must be typed');
});
