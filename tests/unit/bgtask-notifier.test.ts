// bgtask notifier — extraction, template rendering, single delivery, origin fixing.
// submitMessage and web-ai answer lookup are injected (NotifierDeps) — no module mocks.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createTask, getTask, markTerminal, markNotified } from '../../src/bgtask/registry.ts';
import { notifyTask, renderPromptTemplate } from '../../src/bgtask/notifier.ts';
import type { BgTaskCapture } from '../../src/bgtask/runner.ts';
import type { BgTaskSpec } from '../../src/bgtask/types.ts';
import type { SubmitResult } from '../../src/orchestrator/gateway.ts';

let seq = 0;
function makeTerminalTask(input: {
    spec?: Partial<BgTaskSpec>;
    status?: 'complete' | 'failed';
    capture?: Partial<BgTaskCapture>;
    originMeta?: Record<string, unknown>;
}): string {
    seq += 1;
    const spec: BgTaskSpec = {
        command: ['node', '-e', `// notifier ${seq}`],
        completion: { type: 'exit' },
        promptTemplate: '[bgtask:{{taskId}}] {{status}}: {{result}}',
        ...input.spec,
    };
    const row = createTask({ kind: 'shell', spec, originMeta: input.originMeta as never });
    const capture: BgTaskCapture = { stdoutTail: [], stderrTail: [], ...input.capture };
    markTerminal(row.id, input.status ?? 'complete', JSON.stringify(capture));
    return row.id;
}

interface SubmitCall { text: string; meta: Record<string, unknown> }

function makeSubmitSpy(action: SubmitResult['action'] = 'started', reason?: string) {
    const calls: SubmitCall[] = [];
    const submit = ((text: string, meta: Record<string, unknown>): SubmitResult => {
        calls.push({ text, meta });
        return { action, ...(reason ? { reason } : {}), requestId: 'req-test' } as SubmitResult;
    }) as never;
    return { calls, submit };
}

test('notifyTask submits rendered prompt with origin fixed to bgtask and marks notified', async () => {
    const id = makeTerminalTask({
        capture: { stdoutTail: ['line a', 'line b'] },
        originMeta: { origin: 'telegram', chatId: '777', target: { channel: 'telegram', targetKind: 'user', peerKind: 'direct', targetId: '777' } },
    });
    const { calls, submit } = makeSubmitSpy();
    assert.equal(await notifyTask(id, { submit }), true);
    assert.equal(calls.length, 1);
    const call = calls[0]!;
    assert.equal(call.meta['origin'], 'bgtask', 'origin must be bgtask, never the stored originMeta.origin');
    assert.equal(call.meta['chatId'], '777');
    assert.ok(call.text.includes(`[bgtask:${id}] complete:`));
    assert.ok(call.text.includes('line a\nline b'));
    assert.ok(getTask(id)?.notifiedAt, 'notified_at recorded');
});

test('notifyTask is idempotent: already-notified and non-terminal tasks are skipped', async () => {
    const id = makeTerminalTask({ capture: { stdoutTail: ['x'] } });
    markNotified(id);
    const { calls, submit } = makeSubmitSpy();
    assert.equal(await notifyTask(id, { submit }), false);
    assert.equal(calls.length, 0);

    const running = createTask({
        kind: 'shell',
        spec: { command: ['node', '-e', '// running'], completion: { type: 'exit' }, promptTemplate: 'p {{result}}' },
    });
    assert.equal(await notifyTask(running.id, { submit }), false);
    assert.equal(calls.length, 0);
});

test('gateway duplicate rejection still marks notified; other rejections do not', async () => {
    const dupId = makeTerminalTask({ capture: { stdoutTail: ['d'] } });
    const dup = makeSubmitSpy('rejected', 'duplicate');
    assert.equal(await notifyTask(dupId, { submit: dup.submit }), true);
    assert.ok(getTask(dupId)?.notifiedAt);

    const busyId = makeTerminalTask({ capture: { stdoutTail: ['e'] } });
    const rej = makeSubmitSpy('rejected', 'empty');
    assert.equal(await notifyTask(busyId, { submit: rej.submit }), false);
    assert.equal(getTask(busyId)?.notifiedAt, null, 'stays un-notified for recovery re-delivery');
});

test('matched-line and tail-lines extractors', async () => {
    const matchedId = makeTerminalTask({
        spec: { resultExtractor: { type: 'matched-line' }, completion: { type: 'line-pattern', regex: 'OK' }, command: ['node', '-e', '// m'] },
        capture: { matchedLine: 'OK: result line', stdoutTail: ['noise', 'OK: result line'] },
    });
    const a = makeSubmitSpy();
    await notifyTask(matchedId, { submit: a.submit });
    assert.ok(a.calls[0]!.text.includes('OK: result line'));
    assert.ok(!a.calls[0]!.text.includes('noise'));

    const tailId = makeTerminalTask({
        spec: { resultExtractor: { type: 'tail-lines', n: 2 } },
        capture: { stdoutTail: ['1', '2', '3', '4'] },
    });
    const b = makeSubmitSpy();
    await notifyTask(tailId, { submit: b.submit });
    assert.ok(b.calls[0]!.text.includes('3\n4'));
    assert.ok(!b.calls[0]!.text.includes('1\n2'));
});

test('session-answer extractor uses injected web-ai answer lookup', async () => {
    const id = makeTerminalTask({
        spec: {
            completion: { type: 'session-status', sessionId: 'S_NOTIF' },
            resultExtractor: { type: 'session-answer' },
        },
        capture: { sessionStatus: 'complete' },
    });
    const { calls, submit } = makeSubmitSpy();
    await notifyTask(id, { submit, getWebAiAnswer: async (sid) => (sid === 'S_NOTIF' ? 'the answer' : null) });
    assert.ok(calls[0]!.text.includes('the answer'));
});

test('failed task prompt carries failure reason and stderr tail', async () => {
    const id = makeTerminalTask({
        status: 'failed',
        capture: { reason: 'stalled: no output for 300ms', stderrTail: ['err1', 'err2'] },
    });
    const { calls, submit } = makeSubmitSpy();
    await notifyTask(id, { submit });
    const text = calls[0]!.text;
    assert.ok(text.includes('failed:'));
    assert.ok(text.includes('FAILED: stalled'));
    assert.ok(text.includes('err2'));
});

test('oversized result is truncated to maxResultChars', async () => {
    const id = makeTerminalTask({
        spec: { maxResultChars: 100 },
        capture: { stdoutTail: ['y'.repeat(500)] },
    });
    const { calls, submit } = makeSubmitSpy();
    await notifyTask(id, { submit });
    assert.ok(calls[0]!.text.includes('[truncated'));
    assert.ok(calls[0]!.text.length < 400);
});

test('renderPromptTemplate replaces all placeholders', () => {
    const row = getTask(makeTerminalTask({}))!;
    const out = renderPromptTemplate(row, 'R');
    assert.ok(out.includes(row.id));
    assert.ok(out.includes('complete'));
    assert.ok(out.endsWith('R'));
});
