import { readSource } from './source-normalize.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

const __dirname = import.meta.dirname;
const projectRoot = join(__dirname, '../..');

const handlerSrc = readSource(join(projectRoot, 'src/cli/handlers-workflows.ts'), 'utf8');
const deliberateSrc = readSource(join(projectRoot, 'src/workflows/deliberate.ts'), 'utf8');

// ─── DW: Deliberate Workflow Builder ─────────────────

test('DW-001: deliberate builder creates deliberationPlan artifact', () => {
    assert.ok(
        deliberateSrc.includes("'deliberationPlan'"),
        'deliberate.ts must create artifact with kind deliberationPlan',
    );
});

test('DW-002: deliberate builder has input and roles sections', () => {
    assert.ok(
        deliberateSrc.includes("id: 'input'"),
        'deliberate artifact must have input section',
    );
    assert.ok(
        deliberateSrc.includes("id: 'roles'"),
        'deliberate artifact must have roles section',
    );
});

test('DW-003: deliberate builder sets non-authoritative local-cache lifetime', () => {
    assert.ok(
        deliberateSrc.includes("lifetime: 'local-cache'"),
        'deliberate artifact must be local-cache lifetime',
    );
    assert.ok(
        deliberateSrc.includes('authoritative: false'),
        'deliberate artifact must be non-authoritative',
    );
});

test('DW-004: deliberate builder preserves sourcePrompt', () => {
    assert.ok(
        deliberateSrc.includes('sourcePrompt'),
        'deliberate artifact must include sourcePrompt',
    );
});

test('DW-005: deliberate builder has Planner/Architect/Critic roles', () => {
    assert.ok(deliberateSrc.includes('Planner'), 'must include Planner role');
    assert.ok(deliberateSrc.includes('Architect'), 'must include Architect role');
    assert.ok(deliberateSrc.includes('Critic'), 'must include Critic role');
});

test('DW-006: deliberate builder ends with recommendation instruction', () => {
    assert.ok(
        deliberateSrc.includes('recommended option'),
        'must instruct to end with one recommended option',
    );
});

// ─── DW: Handler Integration ─────────────────────────

test('DW-010: handler imports buildDeliberateArtifact', () => {
    assert.ok(
        handlerSrc.includes('buildDeliberateArtifact'),
        'handler must import buildDeliberateArtifact',
    );
});

test('DW-011: handler returns artifact in result', () => {
    assert.ok(
        handlerSrc.includes('artifact,') || handlerSrc.includes('artifact:'),
        'handler must include artifact in result',
    );
});

test('DW-012: handler returns steerPrompt for LLM guidance', () => {
    assert.ok(
        handlerSrc.includes('steerPrompt:'),
        'handler must include steerPrompt to guide LLM deliberation',
    );
});

test('DW-013: handler does not dispatch employees', () => {
    const fnBlock = handlerSrc.slice(
        handlerSrc.indexOf('deliberateWorkflowHandler'),
        handlerSrc.indexOf('planAuditWorkflowHandler'),
    );
    assert.ok(
        !fnBlock.includes('dispatch'),
        'deliberate handler must not dispatch employees',
    );
});

// ─── DW: Guardrails ──────────────────────────────────

test('DW-020: deliberate does not write files', () => {
    assert.ok(
        !deliberateSrc.includes('writeFileSync') && !deliberateSrc.includes('writeFile'),
        'deliberate workflow must not write project files',
    );
});

test('DW-021: deliberate does not use state machine', () => {
    assert.ok(
        !deliberateSrc.includes('setState') && !deliberateSrc.includes('canTransition'),
        'deliberate workflow must not use state machine (prompt-only)',
    );
});
