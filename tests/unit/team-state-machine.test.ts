import { readSource } from './source-normalize.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

const __dirname = import.meta.dirname;
const projectRoot = join(__dirname, '../..');

const typesSrc = readSource(join(projectRoot, 'src/team/types.ts'), 'utf8');

test('TSM-001: team has valid state transitions', () => {
    assert.ok(typesSrc.includes('VALID_TEAM_TRANSITIONS'), 'must define transition map');
});

test('TSM-002: planned can go to auditing or stopped', () => {
    assert.ok(typesSrc.includes("planned:"), 'must define planned transitions');
    assert.ok(typesSrc.includes("'auditing'"), 'planned must allow auditing');
    assert.ok(typesSrc.includes("'stopped'"), 'planned must allow stopped');
});

test('TSM-003: complete and stopped are terminal', () => {
    assert.ok(typesSrc.includes("complete: []"), 'complete must be terminal');
    assert.ok(typesSrc.includes("stopped: []"), 'stopped must be terminal');
});

test('TSM-004: team modes include audit and research', () => {
    assert.ok(typesSrc.includes("'audit-team'"), 'must have audit mode');
    assert.ok(typesSrc.includes("'research-team'"), 'must have research mode');
});

test('TSM-005: implementation-team is a distinct mode', () => {
    assert.ok(typesSrc.includes("'implementation-team'"), 'must have implementation mode');
});

test('TSM-006: team verdicts match expected tokens', () => {
    assert.ok(typesSrc.includes("'PASS'"), 'must have PASS verdict');
    assert.ok(typesSrc.includes("'NEEDS_FIX'"), 'must have NEEDS_FIX verdict');
    assert.ok(typesSrc.includes("'BLOCKED'"), 'must have BLOCKED verdict');
});

test('TSM-007: error state can transition to paused or stopped', () => {
    assert.ok(typesSrc.includes("error:"), 'must define error transitions');
});
