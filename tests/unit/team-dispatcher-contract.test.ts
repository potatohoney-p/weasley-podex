import { readSource } from './source-normalize.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

const __dirname = import.meta.dirname;
const projectRoot = join(__dirname, '../..');

const dispatcherSrc = readSource(join(projectRoot, 'src/team/dispatcher.ts'), 'utf8');

test('TD-001: dispatcher builds handoff tasks', () => {
    assert.ok(dispatcherSrc.includes('buildTeamDispatchTask'), 'must export dispatch builder');
    assert.ok(dispatcherSrc.includes('buildHandoff'), 'must use handoff builder');
});

test('TD-002: dispatcher includes team and lane metadata', () => {
    assert.ok(dispatcherSrc.includes('Team:'), 'must include team ID in task');
    assert.ok(dispatcherSrc.includes('Lane:'), 'must include lane ID in task');
    assert.ok(dispatcherSrc.includes('Role:'), 'must include role in task');
});

test('TD-003: dispatcher defaults to read-only for audit/research', () => {
    assert.ok(dispatcherSrc.includes("'read-only'"), 'audit mode must be read-only');
});

test('TD-004: dispatcher includes file scope', () => {
    assert.ok(dispatcherSrc.includes('File scope'), 'must include scope in task');
});

test('TD-005: dispatcher builds all lane tasks', () => {
    assert.ok(dispatcherSrc.includes('buildAllDispatchTasks'), 'must export batch builder');
});

test('TD-006: dispatcher has no SDK imports', () => {
    const sdks = ['openai', '@anthropic-ai/sdk', 'ai', '@ai-sdk/'];
    for (const sdk of sdks) {
        assert.ok(!dispatcherSrc.includes(`from '${sdk}`), `must not import ${sdk}`);
    }
});
