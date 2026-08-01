// bgtask registry — state transitions, dedup, recovery set
// Runs against the isolated WEASLEY_PODEX_HOME temp DB (tests/setup/test-home.ts).

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    createTask,
    getTask,
    listTasks,
    setTaskPid,
    markTerminal,
    markCancelled,
    markOrphaned,
    markNotified,
    loadRecoverable,
    findActiveDuplicate,
    DuplicateBgTaskError,
} from '../../src/bgtask/registry.ts';
import { validateBgTaskSpec, dedupKeyForSpec, type BgTaskSpec } from '../../src/bgtask/types.ts';

let seq = 0;
function childSpec(overrides: Partial<BgTaskSpec> = {}): BgTaskSpec {
    seq += 1;
    return {
        command: ['node', '-e', `process.exit(0) // ${seq}`],
        completion: { type: 'exit' },
        promptTemplate: 'task {{taskId}} done: {{result}}',
        ...overrides,
    };
}

function probeSpec(sessionId: string): BgTaskSpec {
    return {
        completion: { type: 'session-status', sessionId },
        resultExtractor: { type: 'session-answer' },
        promptTemplate: 'web-ai {{taskId}} {{status}}: {{result}}',
    };
}

// ─── create / get / list ─────────────────────────────

test('createTask inserts a running row with parsed spec and originMeta', () => {
    const row = createTask({
        kind: 'shell',
        spec: childSpec(),
        originMeta: { origin: 'telegram', chatId: '123' },
    });
    assert.equal(row.status, 'running');
    assert.ok(row.id.startsWith('bg_'));
    assert.equal(row.originMeta.chatId, '123');
    assert.equal(row.spec.completion.type, 'exit');
    assert.equal(row.notifiedAt, null);

    const fetched = getTask(row.id);
    assert.ok(fetched);
    assert.equal(fetched.kind, 'shell');
});

test('listTasks filters by status', () => {
    const row = createTask({ kind: 'shell', spec: childSpec() });
    const running = listTasks({ status: 'running' });
    assert.ok(running.some((t) => t.id === row.id));
    markTerminal(row.id, 'complete', 'ok');
    assert.ok(!listTasks({ status: 'running' }).some((t) => t.id === row.id));
    assert.ok(listTasks({ status: 'complete' }).some((t) => t.id === row.id));
});

// ─── transitions ─────────────────────────────────────

test('markTerminal transitions running→complete once, refuses double transition', () => {
    const row = createTask({ kind: 'shell', spec: childSpec() });
    setTaskPid(row.id, 4242);
    assert.equal(getTask(row.id)?.pid, 4242);

    assert.equal(markTerminal(row.id, 'complete', 'answer text'), true);
    const done = getTask(row.id);
    assert.equal(done?.status, 'complete');
    assert.equal(done?.result, 'answer text');
    assert.equal(done?.pid, null);
    assert.ok(done?.completedAt);

    // second transition must be a no-op (guards double-notify)
    assert.equal(markTerminal(row.id, 'failed', 'late error'), false);
    assert.equal(getTask(row.id)?.status, 'complete');
});

test('markCancelled and markOrphaned only apply to running tasks', () => {
    const a = createTask({ kind: 'shell', spec: childSpec() });
    assert.equal(markCancelled(a.id), true);
    assert.equal(getTask(a.id)?.status, 'cancelled');
    assert.equal(markOrphaned(a.id), false);

    const b = createTask({ kind: 'shell', spec: childSpec() });
    assert.equal(markOrphaned(b.id), true);
    assert.equal(getTask(b.id)?.status, 'orphaned');
});

// ─── dedup ───────────────────────────────────────────

test('duplicate active child command is rejected; allowed again after terminal', () => {
    const spec = childSpec();
    const row = createTask({ kind: 'shell', spec });
    assert.ok(findActiveDuplicate(spec));
    assert.throws(() => createTask({ kind: 'shell', spec }), DuplicateBgTaskError);

    markTerminal(row.id, 'failed', 'boom');
    assert.equal(findActiveDuplicate(spec), null);
    const again = createTask({ kind: 'shell', spec });
    assert.notEqual(again.id, row.id);
});

test('probe dedup keys by sessionId, not command', () => {
    const sid = `S_${Date.now()}`;
    assert.equal(dedupKeyForSpec(probeSpec(sid)), `session:${sid}`);
    createTask({ kind: 'web-ai', spec: probeSpec(sid) });
    assert.throws(() => createTask({ kind: 'web-ai', spec: probeSpec(sid) }), DuplicateBgTaskError);
    // different session is fine
    createTask({ kind: 'web-ai', spec: probeSpec(`${sid}_other`) });
});

// ─── recovery set ────────────────────────────────────

test('loadRecoverable returns running + terminal-but-unnotified rows only', () => {
    const running = createTask({ kind: 'shell', spec: childSpec() });
    const unnotified = createTask({ kind: 'shell', spec: childSpec() });
    markTerminal(unnotified.id, 'complete', 'r');
    const notified = createTask({ kind: 'shell', spec: childSpec() });
    markTerminal(notified.id, 'failed', 'e');
    markNotified(notified.id);
    const cancelled = createTask({ kind: 'shell', spec: childSpec() });
    markCancelled(cancelled.id);

    const ids = new Set(loadRecoverable().map((r) => r.id));
    assert.ok(ids.has(running.id), 'running task recoverable');
    assert.ok(ids.has(unnotified.id), 'unnotified complete task recoverable');
    assert.ok(!ids.has(notified.id), 'notified task not recoverable');
    assert.ok(!ids.has(cancelled.id), 'cancelled task not recoverable');
});

// ─── spec validation ─────────────────────────────────

test('validateBgTaskSpec accepts child and probe specs, rejects malformed ones', () => {
    assert.equal(validateBgTaskSpec(childSpec()).ok, true);
    assert.equal(validateBgTaskSpec(probeSpec('S1')).ok, true);

    const noCommand = validateBgTaskSpec({ completion: { type: 'exit' }, promptTemplate: 'x' });
    assert.equal(noCommand.ok, false);

    const noPrompt = validateBgTaskSpec({ command: ['ls'], completion: { type: 'exit' } });
    assert.equal(noPrompt.ok, false);

    const badRegex = validateBgTaskSpec({
        command: ['ls'], promptTemplate: 'x',
        completion: { type: 'line-pattern', regex: '(' },
    });
    assert.equal(badRegex.ok, false);

    const emptyMatch = validateBgTaskSpec({
        command: ['ls'], promptTemplate: 'x',
        completion: { type: 'json-line', match: {} },
    });
    assert.equal(emptyMatch.ok, false);

    const probeNoSession = validateBgTaskSpec({
        promptTemplate: 'x',
        completion: { type: 'session-status', sessionId: ' ' },
    });
    assert.equal(probeNoSession.ok, false);

    const badDeadline = validateBgTaskSpec({ ...childSpec(), deadlineAt: 'not-a-date' });
    assert.equal(badDeadline.ok, false);
});
