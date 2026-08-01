// bgtask runner — child-mode completion (exit / json-line / line-pattern),
// stall, deadline, cancel. Uses real `node -e` children for determinism.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createTask, getTask } from '../../src/bgtask/registry.ts';
import { startTask, cancelTask, stopAllBgTasks, isTaskRunnerActive, type BgTaskCapture } from '../../src/bgtask/runner.ts';
import type { BgTaskSpec } from '../../src/bgtask/types.ts';

function nodeSpec(script: string, overrides: Partial<BgTaskSpec> = {}): BgTaskSpec {
    return {
        command: [process.execPath, '-e', script],
        completion: { type: 'exit' },
        promptTemplate: 't {{taskId}} {{status}} {{result}}',
        ...overrides,
    };
}

function waitForTerminal(taskId: string, timeoutMs = 8000): Promise<string> {
    return new Promise((resolve, reject) => {
        const start = Date.now();
        const t = setInterval(() => {
            const row = getTask(taskId);
            if (row && row.status !== 'running') {
                clearInterval(t);
                resolve(row.status);
                return;
            }
            if (Date.now() - start > timeoutMs) {
                clearInterval(t);
                reject(new Error(`task ${taskId} still running after ${timeoutMs}ms`));
            }
        }, 50);
    });
}

function capture(taskId: string): BgTaskCapture {
    return JSON.parse(getTask(taskId)?.result ?? '{}') as BgTaskCapture;
}

test('exit completion: code 0 → complete with stdout tail + exit code', async () => {
    const row = createTask({ kind: 'shell', spec: nodeSpec('console.log("hello"); console.log("world");') });
    const fired: string[] = [];
    startTask(row, (id) => fired.push(id));
    assert.equal(await waitForTerminal(row.id), 'complete');
    assert.deepEqual(fired, [row.id]);
    const cap = capture(row.id);
    assert.equal(cap.exitCode, 0);
    assert.deepEqual(cap.stdoutTail.slice(-2), ['hello', 'world']);
    assert.equal(isTaskRunnerActive(row.id), false);
});

test('exit completion: non-zero code → failed with stderr tail', async () => {
    const row = createTask({ kind: 'shell', spec: nodeSpec('console.error("boom"); process.exit(3);') });
    startTask(row, () => {});
    assert.equal(await waitForTerminal(row.id), 'failed');
    const cap = capture(row.id);
    assert.equal(cap.exitCode, 3);
    assert.ok(cap.stderrTail.includes('boom'));
});

test('json-line completion: terminal even if process lingers; wildcard match', async () => {
    const script = 'console.log(JSON.stringify({type:"watch.tick"})); console.log(JSON.stringify({type:"watch.complete", ok:true})); setInterval(()=>{}, 1000);';
    const row = createTask({
        kind: 'web-ai',
        spec: nodeSpec(script, { completion: { type: 'json-line', match: { type: 'watch.*' } } }),
    });
    // matches watch.tick first due to wildcard — captures the FIRST matching line
    const fired: string[] = [];
    startTask(row, (id) => fired.push(id));
    assert.equal(await waitForTerminal(row.id), 'complete');
    assert.equal(fired.length, 1, 'onTerminal fires exactly once');
    const cap = capture(row.id);
    assert.ok(cap.matchedLine?.includes('watch.'));
});

test('json-line completion: exact match skips non-matching lines', async () => {
    const script = 'console.log(JSON.stringify({type:"watch.tick"})); console.log(JSON.stringify({type:"watch.complete"})); ';
    const row = createTask({
        kind: 'web-ai',
        spec: nodeSpec(script, { completion: { type: 'json-line', match: { type: 'watch.complete' } } }),
    });
    startTask(row, () => {});
    assert.equal(await waitForTerminal(row.id), 'complete');
    assert.ok(capture(row.id).matchedLine?.includes('watch.complete'));
});

test('json-line completion: process exits without match → failed', async () => {
    const row = createTask({
        kind: 'web-ai',
        spec: nodeSpec('console.log("no json here");', { completion: { type: 'json-line', match: { type: 'never' } } }),
    });
    startTask(row, () => {});
    assert.equal(await waitForTerminal(row.id), 'failed');
    assert.match(capture(row.id).reason ?? '', /exited before completion/);
});

test('line-pattern completion matches sentinel', async () => {
    const row = createTask({
        kind: 'shell',
        spec: nodeSpec('console.log("step 1"); console.log("READY: all good");', {
            completion: { type: 'line-pattern', regex: '^READY:' },
        }),
    });
    startTask(row, () => {});
    assert.equal(await waitForTerminal(row.id), 'complete');
    assert.equal(capture(row.id).matchedLine, 'READY: all good');
});

test('stall without respawn → failed with stall reason', async () => {
    const row = createTask({
        kind: 'shell',
        spec: nodeSpec('setInterval(()=>{}, 1000);', { stallAfterMs: 300 }),
    });
    startTask(row, () => {});
    assert.equal(await waitForTerminal(row.id), 'failed');
    assert.match(capture(row.id).reason ?? '', /stalled/);
});

test('deadline exceeded → failed', async () => {
    const row = createTask({
        kind: 'shell',
        spec: nodeSpec('setInterval(()=>{}, 1000);', {
            deadlineAt: new Date(Date.now() + 400).toISOString(),
        }),
    });
    startTask(row, () => {});
    assert.equal(await waitForTerminal(row.id), 'failed');
    assert.match(capture(row.id).reason ?? '', /deadline/);
});

test('cancelTask → cancelled, no terminal callback', async () => {
    const row = createTask({ kind: 'shell', spec: nodeSpec('setInterval(()=>{}, 1000);') });
    const fired: string[] = [];
    startTask(row, (id) => fired.push(id));
    assert.equal(isTaskRunnerActive(row.id), true);
    assert.equal(cancelTask(row.id), true);
    assert.equal(getTask(row.id)?.status, 'cancelled');
    // give the exit handler a beat — it must NOT flip status or notify
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(getTask(row.id)?.status, 'cancelled');
    assert.equal(fired.length, 0);
    assert.equal(isTaskRunnerActive(row.id), false);
});

test('stopAllBgTasks tears down runners but leaves rows running (recovery handles them)', async () => {
    const row = createTask({ kind: 'shell', spec: nodeSpec('setInterval(()=>{}, 1000);') });
    startTask(row, () => {});
    assert.equal(isTaskRunnerActive(row.id), true);
    stopAllBgTasks();
    assert.equal(isTaskRunnerActive(row.id), false);
    assert.equal(getTask(row.id)?.status, 'running', 'row stays running for boot recovery');
});
