import test from 'node:test';
import assert from 'node:assert/strict';

const listeners = new Set<(type: string, data: Record<string, any>) => void>();
const timers = new Set<() => void>();
let dispatch: (meta: Record<string, any>) => unknown;
const emit = (type: string, data: Record<string, any>) => {
    for (const listener of listeners) listener(type, data);
};
test.mock.module('../../src/core/bus.ts', { namedExports: {
    addBroadcastListener: (fn: typeof listeners extends Set<infer T> ? T : never) => listeners.add(fn),
    removeBroadcastListener: (fn: typeof listeners extends Set<infer T> ? T : never) => listeners.delete(fn),
} });
test.mock.module('../../src/orchestrator/pipeline.ts', { namedExports: {
    isContinueIntent: (prompt: string) => prompt === '/continue',
    isResetIntent: (prompt: string) => prompt === '/reset',
    orchestrate: (_prompt: string, meta: Record<string, any>) => dispatch(meta),
    orchestrateContinue: (meta: Record<string, any>) => dispatch(meta),
    orchestrateReset: (meta: Record<string, any>) => dispatch(meta),
} });
test.mock.module('../../src/core/i18n.ts', { namedExports: { t: (key: string) => key } });
const { orchestrateAndCollectData } = await import('../../src/orchestrator/collect.ts');

test.beforeEach(() => {
    listeners.clear(); timers.clear();
    test.mock.method(globalThis, 'setTimeout', (callback: () => void) => { timers.add(callback); return callback; });
    test.mock.method(globalThis, 'clearTimeout', (timer: () => void) => timers.delete(timer));
});
test.afterEach(() => { test.mock.restoreAll(); listeners.clear(); timers.clear(); });

for (const prompt of ['task', '/continue', '/reset']) {
    test(`synchronous completion releases collector timer and listener: ${prompt}`, async () => {
        dispatch = (meta) => { emit('orchestrate_done', { ...meta, text: 'done' }); };
        assert.equal((await orchestrateAndCollectData(prompt, { requestId: 'own' })).text, 'done');
        assert.equal(listeners.size, 0);
        assert.equal(timers.size, 0);
    });
}

test('synchronous dispatch failure resolves error and releases listener and timer', async () => {
    dispatch = () => { throw new Error('dispatch failed'); };
    assert.equal((await orchestrateAndCollectData('task')).text, '❌ dispatch failed');
    assert.equal(listeners.size, 0);
    assert.equal(timers.size, 0);
});

test('asynchronous completion and late rejection settle only once', async () => {
    let reject!: (error: Error) => void;
    dispatch = () => new Promise((_resolve, fail) => { reject = fail; });
    const pending = orchestrateAndCollectData('task', { requestId: 'own' });
    assert.equal(timers.size, 1);
    emit('orchestrate_done', { requestId: 'other', text: 'wrong' });
    assert.equal(listeners.size, 1);
    emit('orchestrate_done', { requestId: 'own', text: 'right', agyPlannerOnly: true });
    reject(new Error('late'));
    const result = await pending;
    await Promise.resolve();
    assert.equal(result.text, 'right');
    assert.equal(result.data.agyPlannerOnly, true);
    assert.equal(listeners.size, 0);
    assert.equal(timers.size, 0);
});

test('idle timeout releases collector and cannot be rearmed by later activity', async () => {
    dispatch = () => new Promise(() => {});
    const pending = orchestrateAndCollectData('task');
    emit('agent_done', { error: true, text: 'partial error' });
    assert.equal(timers.size, 1);
    const timeout = [...timers][0]!;
    timers.delete(timeout);
    timeout();
    assert.equal((await pending).text, 'partial error');
    emit('agent_output', { text: 'late' });
    assert.equal(listeners.size, 0);
    assert.equal(timers.size, 0);
});

for (const reason of [new Error('async failed'), 'string failure', null]) {
    test(`rejected dispatch releases resources for ${String(reason)}`, async () => {
        dispatch = () => Promise.reject(reason);
        const result = await orchestrateAndCollectData('task');
        assert.equal(result.text, `❌ ${reason instanceof Error ? reason.message : String(reason)}`);
        assert.equal(listeners.size, 0);
        assert.equal(timers.size, 0);
    });
}

test('synchronous completion wins over a subsequent synchronous throw', async () => {
    dispatch = () => {
        emit('orchestrate_done', { text: 'first' });
        throw new Error('late');
    };
    assert.equal((await orchestrateAndCollectData('task')).text, 'first');
    assert.equal(listeners.size, 0);
    assert.equal(timers.size, 0);
});

for (const [name, reason] of [
    ['null prototype', Object.create(null)],
    ['throwing toString', { toString() { throw new Error('not printable'); } }],
] as const) {
    test(`unprintable rejection (${name}) still settles and releases resources`, async () => {
        dispatch = () => Promise.reject(reason);
        assert.equal((await orchestrateAndCollectData('task')).text, '❌ Unknown error');
        assert.equal(listeners.size, 0);
        assert.equal(timers.size, 0);
    });
}
