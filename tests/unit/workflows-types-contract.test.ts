import { readSource } from './source-normalize.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';

const __dirname = import.meta.dirname;
const projectRoot = join(__dirname, '../..');

const workflowsDir = join(projectRoot, 'src/workflows');
const typesSrc = readSource(join(workflowsDir, 'types.ts'), 'utf8');
const contextSrc = readSource(join(workflowsDir, 'context.ts'), 'utf8');
const eventsSrc = readSource(join(workflowsDir, 'events.ts'), 'utf8');
const guardsSrc = readSource(join(workflowsDir, 'guards.ts'), 'utf8');
const indexSrc = readSource(join(workflowsDir, 'index.ts'), 'utf8');

const SDK_DENYLIST = [
    'openai', '@openai/agents', '@anthropic-ai/sdk',
    '@google/generative-ai', '@google/genai', 'ai', '@ai-sdk/',
];

function scanForSdkImports(src: string): string[] {
    return SDK_DENYLIST.filter(sdk => src.includes(`from '${sdk}`) || src.includes(`from "${sdk}`));
}

test('WT-001: types.ts has no SDK imports', () => {
    const found = scanForSdkImports(typesSrc);
    assert.deepEqual(found, [], `forbidden SDK imports: ${found.join(', ')}`);
});

test('WT-002: context.ts has no SDK imports', () => {
    const found = scanForSdkImports(contextSrc);
    assert.deepEqual(found, [], `forbidden SDK imports: ${found.join(', ')}`);
});

test('WT-003: events.ts has no SDK imports', () => {
    const found = scanForSdkImports(eventsSrc);
    assert.deepEqual(found, [], `forbidden SDK imports: ${found.join(', ')}`);
});

test('WT-004: guards.ts has no SDK imports', () => {
    const found = scanForSdkImports(guardsSrc);
    assert.deepEqual(found, [], `forbidden SDK imports: ${found.join(', ')}`);
});

test('WT-005: all src/workflows/ files are SDK-free', () => {
    const files = readdirSync(workflowsDir).filter(f => f.endsWith('.ts'));
    const violations: string[] = [];
    for (const file of files) {
        const src = readFileSync(join(workflowsDir, file), 'utf8');
        const found = scanForSdkImports(src);
        if (found.length) violations.push(`${file}: ${found.join(', ')}`);
    }
    assert.deepEqual(violations, [], `SDK violations: ${violations.join('; ')}`);
});

test('WT-006: WorkflowEvent has stable schemaVersion discriminant', () => {
    assert.ok(typesSrc.includes("'workflow-event-v1'"), 'must define workflow-event-v1');
});

test('WT-007: WorkflowCommandEnvelope has stable schemaVersion', () => {
    assert.ok(typesSrc.includes("'workflow-command.v1'"), 'must define workflow-command.v1');
});

test('WT-008: WorkflowRunContext has repoRoot and source', () => {
    assert.ok(typesSrc.includes('repoRoot'), 'must have repoRoot');
    assert.ok(typesSrc.includes('source'), 'must have source');
    assert.ok(typesSrc.includes('orcState'), 'must have orcState');
});

test('WT-009: WorkflowGuardResult returns data not thrown errors', () => {
    assert.ok(typesSrc.includes('ok: boolean'), 'guard has ok boolean');
    assert.ok(typesSrc.includes('severity'), 'guard has severity');
    assert.ok(!guardsSrc.includes('throw new'), 'guards must not throw');
});

test('WT-010: index.ts barrel exports all public types', () => {
    assert.ok(indexSrc.includes('WorkflowRunContext'), 'exports WorkflowRunContext');
    assert.ok(indexSrc.includes('WorkflowEvent'), 'exports WorkflowEvent');
    assert.ok(indexSrc.includes('WorkflowGuardResult'), 'exports WorkflowGuardResult');
    assert.ok(indexSrc.includes('WorkflowHandoff'), 'exports WorkflowHandoff');
    assert.ok(indexSrc.includes('buildWorkflowRunContext'), 'exports context builder');
    assert.ok(indexSrc.includes('createWorkflowEvent'), 'exports event creator');
    assert.ok(indexSrc.includes('guardPass'), 'exports guard helpers');
});

test('WT-011: WorkflowEvent can serialize to JSON', () => {
    assert.ok(typesSrc.includes('workflowId: string'), 'workflowId is string');
    assert.ok(typesSrc.includes('sequenceId: number'), 'sequenceId is number');
    assert.ok(typesSrc.includes('createdAt: string'), 'createdAt is string');
});

test('WT-012: WorkflowStatusV1 has workflow discriminant', () => {
    assert.ok(typesSrc.includes("workflow: 'goal' | 'goal-run' | 'team'"), 'status has workflow field');
    assert.ok(typesSrc.includes('confirmationRequired'), 'status has confirmationRequired');
});
