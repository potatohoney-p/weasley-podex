import { readSource } from './source-normalize.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

const __dirname = import.meta.dirname;
const projectRoot = join(__dirname, '../..');

const stateMachineSrc = readSource(join(projectRoot, 'src/orchestrator/state-machine.ts'), 'utf8');
const pipelineSrc = readSource(join(projectRoot, 'src/orchestrator/pipeline.ts'), 'utf8');
const handlerSrc = readSource(join(projectRoot, 'src/cli/handlers-workflows.ts'), 'utf8');
const routeSrc = readSource(join(projectRoot, 'src/routes/orchestrate.ts'), 'utf8');

// ─── IW: Interview State Machine ─────────────────────

test('IW-001: state machine includes I in OrcStateName type', () => {
    assert.match(
        stateMachineSrc,
        /OrcStateName\s*=\s*['"]IDLE['"]\s*\|\s*['"]I['"]/,
        'OrcStateName must include I state',
    );
});

test('IW-002: IDLE→I is a valid transition', () => {
    assert.ok(
        stateMachineSrc.includes("IDLE: ['I', 'P']"),
        'IDLE transitions must include I',
    );
});

test('IW-003: I→P and I→IDLE are valid transitions', () => {
    assert.ok(
        stateMachineSrc.includes("I: ['P', 'IDLE']"),
        'I state must transition to P or IDLE',
    );
});

test('IW-004: state machine has INTERVIEW MODE prefix', () => {
    assert.ok(
        stateMachineSrc.includes('INTERVIEW MODE'),
        'I state should have INTERVIEW MODE prefix',
    );
});

test('IW-005: state machine has I state prompt', () => {
    assert.ok(
        stateMachineSrc.includes('INTERVIEW — Requirements Clarification'),
        'STATE_PROMPTS must include I state interview prompt',
    );
});

test('IW-005b: Interview prompt allows safe structured elicitation without replacing tracker', () => {
    assert.ok(
        stateMachineSrc.includes('## Structured Elicitation UI'),
        'I prompt should include structured elicitation guidance',
    );
    assert.ok(
        stateMachineSrc.includes('standalone elicitation fence'),
        'I prompt should require standalone elicitation fence output',
    );
    assert.ok(
        stateMachineSrc.includes('Prefer 1-3 questions'),
        'I prompt should recommend 1-3 questions',
    );
    assert.ok(
        stateMachineSrc.includes('visibleWhen: { "scope": ["mvp"] }'),
        'I prompt should document visibleWhen prior-answer branching syntax',
    );
    assert.ok(
        stateMachineSrc.includes('Do not put raw internal tag strings'),
        'I prompt should forbid raw internal tag strings in elicitation JSON fields',
    );
    assert.ok(
        stateMachineSrc.includes('does not replace the hidden Interview tracker'),
        'I prompt should preserve the hidden tracker contract',
    );
});

test('IW-006: getPrefix returns Ip for I state', () => {
    assert.ok(
        stateMachineSrc.includes("state === 'I'") && stateMachineSrc.includes('PREFIXES.Ip') || stateMachineSrc.includes('PREFIXES["Ip"]'),
        'getPrefix must return Ip prefix for I state',
    );
});

// ─── IW: Pipeline Interview Turn Detection ───────────

test('IW-010: pipeline detects initial interview turn via !ctx?.interview', () => {
    assert.ok(
        pipelineSrc.includes('isInitialInterviewTurn'),
        'pipeline must define isInitialInterviewTurn',
    );
    assert.ok(
        pipelineSrc.includes('!ctx?.interview'),
        'initial interview detection must check !ctx?.interview',
    );
});

test('IW-011: pipeline creates interview context on first I turn', () => {
    assert.ok(
        pipelineSrc.includes('interview: { request:'),
        'pipeline must create interview object with request field',
    );
});

test('IW-012: pipeline does not create worklog for I state', () => {
    const interviewBlock = pipelineSrc.slice(
        pipelineSrc.indexOf('isInitialInterviewTurn'),
        pipelineSrc.indexOf('isInitialInterviewTurn') + 600,
    );
    assert.ok(
        !interviewBlock.includes('createWorklog'),
        'I state must not create a worklog',
    );
});

// ─── IW: Handler Contract ────────────────────────────

test('IW-020: interview handler uses state machine directly', () => {
    assert.ok(
        handlerSrc.includes('canTransition') && handlerSrc.includes('setState'),
        'interview handler must import canTransition and setState from state-machine',
    );
});

test('IW-021: interview handler does NOT set ctx.interview', () => {
    assert.ok(
        !handlerSrc.includes("interview: {"),
        'handler must not set ctx.interview — pipeline creates it on first turn',
    );
});

test('IW-022: interview handler sends originalPrompt in ctx', () => {
    assert.ok(
        handlerSrc.includes('originalPrompt:'),
        'handler must send originalPrompt for pipeline first-turn detection',
    );
});

test('IW-023: interview handler transitions to I state', () => {
    assert.ok(
        handlerSrc.includes("canTransition(current, 'I')"),
        'handler must check canTransition to I',
    );
    assert.ok(
        handlerSrc.includes("setState('I'"),
        'handler must call setState with I',
    );
});

// ─── IW: Route Accepts I ─────────────────────────────

test('IW-030: orchestrate route PUT accepts I state', () => {
    assert.ok(
        routeSrc.includes("'I'") && routeSrc.includes("'P'"),
        'PUT /api/orchestrate/state valid list must include I',
    );
});
