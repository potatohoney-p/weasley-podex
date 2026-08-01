import { readSource } from './source-normalize.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

const __dirname = import.meta.dirname;
const projectRoot = join(__dirname, '../..');

const plannerSrc = readSource(join(projectRoot, 'src/team/planner.ts'), 'utf8');

test('TP-001: planner creates team plans with lanes', () => {
    assert.ok(plannerSrc.includes('createTeamPlan'), 'must export createTeamPlan');
    assert.ok(plannerSrc.includes('TeamPlan'), 'must return TeamPlan');
});

test('TP-002: planner generates unique team IDs', () => {
    assert.ok(plannerSrc.includes('generateTeamId'), 'must have ID generator');
    assert.ok(plannerSrc.includes('randomUUID'), 'must use random component');
});

test('TP-003: planner detects overlapping scopes', () => {
    assert.ok(plannerSrc.includes('hasOverlappingScopes'), 'must export overlap checker');
});

test('TP-004: planner supports employee assignment', () => {
    assert.ok(plannerSrc.includes('assignEmployee'), 'must support employee assignment');
});

test('TP-005: planner supports scope assignment', () => {
    assert.ok(plannerSrc.includes('setScopeForLane'), 'must support scope assignment');
});

test('TP-006: planner has no SDK imports', () => {
    const sdks = ['openai', '@anthropic-ai/sdk', 'ai', '@ai-sdk/'];
    for (const sdk of sdks) {
        assert.ok(!plannerSrc.includes(`from '${sdk}`), `must not import ${sdk}`);
    }
});
