import { readSource } from './source-normalize.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

const __dirname = import.meta.dirname;
const projectRoot = join(__dirname, '../..');

const preflightSrc = readSource(join(projectRoot, 'src/team/preflight.ts'), 'utf8');

test('TPF-001: preflight checks PABCD state', () => {
    assert.ok(preflightSrc.includes('team-orc-state'), 'must check orchestration state');
});

test('TPF-002: preflight checks worker busy state', () => {
    assert.ok(preflightSrc.includes('team-worker-busy'), 'must check worker busy');
});

test('TPF-003: preflight checks pending replay', () => {
    assert.ok(preflightSrc.includes('team-pending-replay'), 'must check pending replay');
});

test('TPF-004: preflight checks scope overlap for write modes', () => {
    assert.ok(preflightSrc.includes('team-scope-overlap'), 'must check overlap');
    assert.ok(preflightSrc.includes('implementation-team'), 'must gate write modes');
});

test('TPF-005: preflight enforces team size limit', () => {
    assert.ok(preflightSrc.includes('team-size'), 'must check team size');
    assert.ok(preflightSrc.includes('exceeds max 4'), 'must limit to 4');
});

test('TPF-006: preflight uses WorkflowGuardResult', () => {
    assert.ok(preflightSrc.includes('WorkflowGuardResult'), 'must use common guard type');
    assert.ok(preflightSrc.includes('guardPass'), 'must use guard helpers');
    assert.ok(preflightSrc.includes('guardBlock'), 'must use guard helpers');
});

test('TPF-007: unknown scopes block write mode', () => {
    assert.ok(preflightSrc.includes('team-scope-unknown'), 'must block unknown scopes in write mode');
});
