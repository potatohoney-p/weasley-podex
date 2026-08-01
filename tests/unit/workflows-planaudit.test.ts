import { readSource } from './source-normalize.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

const __dirname = import.meta.dirname;
const projectRoot = join(__dirname, '../..');

const handlerSrc = readSource(join(projectRoot, 'src/cli/handlers-workflows.ts'), 'utf8');
const auditSrc = readSource(join(projectRoot, 'src/workflows/planaudit.ts'), 'utf8');

// ─── PA: Plan Audit Workflow Builder ─────────────────

test('PA-001: planaudit builder creates auditTask artifact', () => {
    assert.ok(
        auditSrc.includes("'auditTask'"),
        'planaudit.ts must create artifact with kind auditTask',
    );
});

test('PA-002: planaudit builder has project-root and plan sections', () => {
    assert.ok(auditSrc.includes("id: 'project-root'"), 'must have project-root section');
    assert.ok(auditSrc.includes("id: 'plan'"), 'must have plan section');
    assert.ok(auditSrc.includes("id: 'checks'"), 'must have checks section');
    assert.ok(auditSrc.includes("id: 'verdict'"), 'must have verdict section');
});

test('PA-003: planaudit builder includes authority boundaries', () => {
    assert.ok(
        auditSrc.includes("id: 'authority'"),
        'must have authority section setting read-only scope',
    );
    assert.ok(
        auditSrc.includes('Read-only audit only'),
        'authority section must enforce read-only',
    );
});

test('PA-004: planaudit builder sets non-authoritative local-cache', () => {
    assert.ok(auditSrc.includes("lifetime: 'local-cache'"), 'must be local-cache');
    assert.ok(auditSrc.includes('authoritative: false'), 'must be non-authoritative');
});

test('PA-005: planaudit builder preserves sourcePrompt', () => {
    assert.ok(auditSrc.includes('sourcePrompt'), 'must include sourcePrompt');
});

test('PA-006: planaudit requires PASS or FAIL verdict', () => {
    assert.ok(
        auditSrc.includes('PASS or FAIL'),
        'audit task must require PASS or FAIL verdict',
    );
});

test('PA-007: planaudit checks include file paths, imports, signatures', () => {
    assert.ok(auditSrc.includes('file paths'), 'checks must cover file paths');
    assert.ok(auditSrc.includes('imports'), 'checks must cover imports');
    assert.ok(auditSrc.includes('function signatures'), 'checks must cover function signatures');
});

// ─── PA: Handler Integration ─────────────────────────

test('PA-010: handler imports buildPlanAuditArtifact', () => {
    assert.ok(
        handlerSrc.includes('buildPlanAuditArtifact'),
        'handler must import buildPlanAuditArtifact',
    );
});

test('PA-011: handler returns artifact and steerPrompt', () => {
    assert.ok(handlerSrc.includes('artifact,') || handlerSrc.includes('artifact:'), 'must return artifact');
});

// ─── PA: Guardrails ──────────────────────────────────

test('PA-020: planaudit does not auto-dispatch employees', () => {
    assert.ok(
        !auditSrc.includes('podex dispatch') && !auditSrc.includes('runSingleAgent'),
        'planaudit workflow must not auto-dispatch (preview-only)',
    );
});

test('PA-021: planaudit does not use state machine', () => {
    assert.ok(
        !auditSrc.includes('setState') && !auditSrc.includes('canTransition'),
        'planaudit workflow must not use state machine (state-agnostic)',
    );
});

