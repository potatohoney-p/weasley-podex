import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as turn } from 'node:timers/promises';
import { publish } from '../../src/core/event-bus.ts';
import { startWorkerEventBridge, stopWorkerEventBridge, getCachedLatestMessage } from '../../src/manager/worker-events.ts';

class FakeEventSource {
    static instances: FakeEventSource[] = [];
    readyState = 0;
    onopen: ((event: unknown) => void) | null = null;
    onerror: ((event: unknown) => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    constructor(readonly url: string) { FakeEventSource.instances.push(this); }
    close(): void { this.readyState = 2; }
    ping(): void { this.onmessage?.({ data: JSON.stringify({ topic: 'message', event: 'new_message' }) }); }
}
function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: Error) => void;
    const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}
type Response = { ok: boolean; json: () => Promise<unknown> };
const payload = (id: number) => ({ latestAssistant: { id, text: `message-${id}` } });
const response = (id: number): Response => ({ ok: true, json: async () => ({ data: payload(id) }) });
function status(online: boolean, port = 3457) {
    publish('worker', 'instance-status-changed', { port, change: 'status', next: { status: online ? 'online' : 'offline' } });
}
function harness() {
    stopWorkerEventBridge();
    FakeEventSource.instances = [];
    const calls: Array<ReturnType<typeof deferred<Response>>> = [];
    startWorkerEventBridge({
        debounceMs: 0,
        EventSourceImpl: FakeEventSource as never,
        fetchImpl: async () => { const call = deferred<Response>(); calls.push(call); return call.promise; },
    });
    const wait = async (count: number) => {
        const deadline = Date.now() + 2000;
        while (calls.length < count && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 1));
        assert.equal(calls.length, count, 'expected prefetch has started');
        return calls[count - 1]!;
    };
    return { calls, wait };
}
afterEach(() => stopWorkerEventBridge());

for (const outcome of ['success', 'http-error', 'rejection'] as const) {
    test(`obsolete connection fetch ${outcome} cannot replace or evict reconnected cache`, async () => {
        const h = harness(); status(true); const old = await h.wait(1);
        status(false); status(true); const current = await h.wait(2);
        current.resolve(response(2)); await turn();
        assert.deepEqual(getCachedLatestMessage(3457), payload(2));
        if (outcome === 'success') old.resolve(response(1));
        else if (outcome === 'http-error') old.resolve({ ok: false, json: async () => { throw new Error('must not read failed response'); } });
        else old.reject(new Error('old connection failed'));
        await turn();
        assert.deepEqual(getCachedLatestMessage(3457), payload(2));
    });
}
for (const reject of [false, true]) {
    test(`obsolete JSON ${reject ? 'rejection' : 'completion'} cannot mutate cache after reconnect`, async () => {
        const h = harness(); const body = deferred<unknown>(); const parsing = deferred<void>();
        status(true); (await h.wait(1)).resolve({ ok: true, json: () => { parsing.resolve(); return body.promise; } });
        await parsing.promise;
        status(false); status(true); (await h.wait(2)).resolve(response(2)); await turn();
        if (reject) body.reject(new Error('old body failed')); else body.resolve({ data: payload(1) });
        await turn();
        assert.deepEqual(getCachedLatestMessage(3457), payload(2));
    });
}
test('newer activity invalidates an older in-flight read before the replacement finishes', async () => {
    const h = harness(); status(true); const old = await h.wait(1);
    FakeEventSource.instances[0]!.ping(); const current = await h.wait(2);
    old.resolve(response(1)); await turn();
    assert.equal(getCachedLatestMessage(3457), undefined);
    current.resolve(response(2)); await turn();
    assert.deepEqual(getCachedLatestMessage(3457), payload(2));
});
test('same-connection older JSON cannot overwrite a newer completed read', async () => {
    const h = harness(); const body = deferred<unknown>(); const parsing = deferred<void>();
    status(true); (await h.wait(1)).resolve({ ok: true, json: () => { parsing.resolve(); return body.promise; } });
    await parsing.promise;
    FakeEventSource.instances[0]!.ping(); (await h.wait(2)).resolve(response(2)); await turn();
    body.resolve({ data: payload(1) }); await turn();
    assert.deepEqual(getCachedLatestMessage(3457), payload(2));
});
test('current failures invalidate cache and valid null remains a cache hit', async () => {
    const h = harness(); status(true); (await h.wait(1)).resolve(response(1)); await turn();
    for (const outcome of ['http', 'fetch', 'json'] as const) {
        FakeEventSource.instances[0]!.ping(); const call = await h.wait(h.calls.length + 1);
        if (outcome === 'fetch') call.reject(new Error('current failure'));
        else call.resolve({ ok: outcome !== 'http', json: async () => { throw new Error('invalid current JSON'); } });
        await turn(); assert.equal(getCachedLatestMessage(3457), undefined);
        FakeEventSource.instances[0]!.ping(); (await h.wait(h.calls.length + 1)).resolve(response(1)); await turn();
        assert.deepEqual(getCachedLatestMessage(3457), payload(1));
    }
    FakeEventSource.instances[0]!.ping(); (await h.wait(h.calls.length + 1)).resolve({ ok: true, json: async () => ({ data: null }) });
    await turn(); assert.equal(getCachedLatestMessage(3457), null);
});
test('dropping one port does not invalidate another port and stopped bridge cannot revive', async () => {
    const h = harness(); status(true); const old = await h.wait(1);
    status(true, 3458); const other = await h.wait(2);
    status(false); old.resolve(response(1)); other.resolve(response(8)); await turn();
    assert.equal(getCachedLatestMessage(3457), undefined);
    assert.deepEqual(getCachedLatestMessage(3458), payload(8));
    FakeEventSource.instances[1]!.ping(); const stopped = await h.wait(3);
    stopWorkerEventBridge();
    const next = harness(); status(true, 3458); (await next.wait(1)).resolve(response(9)); await turn();
    stopped.reject(new Error('previous bridge failed')); await turn();
    assert.deepEqual(getCachedLatestMessage(3458), payload(9));
});
