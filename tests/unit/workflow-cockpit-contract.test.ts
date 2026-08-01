import { readSource } from './source-normalize.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const __dirname = import.meta.dirname;
const projectRoot = join(__dirname, '../..');

const stateSrc = readSource(join(projectRoot, 'public/js/state.ts'), 'utf8');
const wsSrc = readSource(join(projectRoot, 'public/js/ws.ts'), 'utf8');
const htmlSrc = readFileSync(join(projectRoot, 'public/index.html'), 'utf8');
const cssSrc = readFileSync(join(projectRoot, 'public/css/workflow-cockpit.css'), 'utf8');

test('WC-001: state.ts includes activeGoal field', () => {
    assert.ok(stateSrc.includes('activeGoal'), 'AppState must include activeGoal field');
});

test('WC-002: state.ts defines ActiveGoalState type', () => {
    assert.ok(stateSrc.includes('ActiveGoalState'), 'must define ActiveGoalState interface');
    assert.ok(stateSrc.includes('GoalStatus'), 'must define GoalStatus type');
});

test('WC-003: ws.ts hydrates goal state from API', () => {
    assert.ok(wsSrc.includes('hydrateGoalState'), 'ws.ts must call hydrateGoalState');
    assert.ok(wsSrc.includes('/api/goal'), 'must fetch /api/goal for goal state');
});

test('WC-004: ws.ts renders goal cockpit', () => {
    assert.ok(wsSrc.includes('renderGoalCockpit'), 'ws.ts must render goal cockpit');
    assert.ok(wsSrc.includes('goalCockpit'), 'must reference goalCockpit element');
});

test('WC-005: index.html has goalCockpit host node', () => {
    assert.ok(htmlSrc.includes('id="goalCockpit"'), 'index.html must have goalCockpit element');
});

test('WC-006: cockpit CSS handles overflow', () => {
    assert.ok(cssSrc.includes('text-overflow: ellipsis'), 'cockpit CSS must truncate long text');
    assert.ok(cssSrc.includes('min-width: 0'), 'cockpit CSS must allow flex shrink');
});

test('WC-007: cockpit CSS has status variants', () => {
    assert.ok(cssSrc.includes('goal-status--active'), 'must have active status style');
    assert.ok(cssSrc.includes('goal-status--paused'), 'must have paused status style');
    assert.ok(cssSrc.includes('goal-status--blocked'), 'must have blocked status style');
});

test('WC-008: index.html links workflow-cockpit.css', () => {
    assert.ok(htmlSrc.includes('workflow-cockpit.css'), 'index.html must link cockpit CSS');
});
