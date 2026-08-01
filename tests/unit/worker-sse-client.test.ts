import test from 'node:test';
import assert from 'node:assert/strict';
import {
    subscribeToWorker, MAX_TRANSIENT_RETRIES,
    type WorkerEventHandlers,
} from '../../src/manager/worker-sse-client.ts';

class FakeEventSource {
    static instances: FakeEventSource[] = [];
    url: string;
    readyState = 0; // CONNECTING
    closed = false;
    onopen: ((e: unknown) => void) | null = null;
    onmessage: ((e: { data: string }) => void) | null = null;
    onerror: ((e: unknown) => void) | null = null;
    constructor(url: string) {
        this.url = url;
        FakeEventSource.instances.push(this);
    }
    close(): void { this.closed = true; this.readyState = 2; }
    emit(payload: unknown): void {
        this.onmessage?.({ data: JSON.stringify(payload) });
    }
}

function setup(handlers: WorkerEventHandlers = {}) {
    FakeEventSource.instances = [];
    const unsub = subscribeToWorker(3457, handlers, FakeEventSource as never);
    const es = FakeEventSource.instances[0]!;
    return { unsub, es };
}

test('dispatches message:new_message and agent:agent_done by topic:event key', () => {
    const got: string[] = [];
    const { es, unsub } = setup({
        onMessage: (port, data) => got.push(`msg:${port}:${data['role']}`),
        onAgentDone: (port) => got.push(`done:${port}`),
    });
    assert.equal(es.url, 'http://127.0.0.1:3457/api/events');
    es.emit({ topic: 'message', event: 'new_message', role: 'user' });
    es.emit({ topic: 'agent', event: 'agent_done', text: 'hi' });
    es.emit({ topic: 'queue', event: 'queue_update' }); // ignored
    es.onmessage?.({ data: 'not-json{' });               // malformed — ignored
    assert.deepEqual(got, ['msg:3457:user', 'done:3457']);
    unsub();
    assert.equal(es.closed, true);
});

test('404 marks the worker unsupported permanently (no retry, no disconnect)', () => {
    const calls: string[] = [];
    const { es } = setup({
        onUnsupported: (port) => calls.push(`unsupported:${port}`),
        onDisconnect: (port) => calls.push(`disconnect:${port}`),
    });
    es.onerror?.({ code: 404 });
    assert.deepEqual(calls, ['unsupported:3457']);
    assert.equal(es.closed, true);
    es.onerror?.({ code: 404 }); // after close — must not double-notify
    assert.deepEqual(calls, ['unsupported:3457']);
});

test('429 (shared rate limiter) is a disconnect, never a permanent unsupported mark', () => {
    const calls: string[] = [];
    const { es } = setup({
        onUnsupported: () => calls.push('unsupported'),
        onDisconnect: () => calls.push('disconnect'),
    });
    es.readyState = 2; // eventsource@3 closes on any non-2xx before onerror
    es.onerror?.({ code: 429 });
    assert.deepEqual(calls, ['disconnect']);
    assert.equal(es.closed, true);
});

test('transient errors disconnect only after exhausting the retry budget', () => {
    const calls: string[] = [];
    const { es } = setup({
        onUnsupported: () => calls.push('unsupported'),
        onDisconnect: () => calls.push('disconnect'),
    });
    for (let i = 0; i < MAX_TRANSIENT_RETRIES; i++) es.onerror?.({});
    assert.deepEqual(calls, [], 'within budget — still retrying');
    es.onerror?.({});
    assert.deepEqual(calls, ['disconnect']);
    assert.equal(es.closed, true);
});

test('onopen resets the transient retry counter', () => {
    const calls: string[] = [];
    const { es } = setup({ onDisconnect: () => calls.push('disconnect') });
    for (let i = 0; i < MAX_TRANSIENT_RETRIES; i++) es.onerror?.({});
    es.onopen?.({});
    for (let i = 0; i < MAX_TRANSIENT_RETRIES; i++) es.onerror?.({});
    assert.deepEqual(calls, [], 'reconnect reset the budget');
});

test('CLOSED readyState without 4xx reports disconnect immediately', () => {
    const calls: string[] = [];
    const { es } = setup({ onDisconnect: () => calls.push('disconnect') });
    es.readyState = 2; // spec: client gave up — no internal retry coming
    es.onerror?.({});
    assert.deepEqual(calls, ['disconnect']);
});

test('internal eventsource reconnect fires onReopen (cache resync ping), first open does not', () => {
    const calls: string[] = [];
    const { es } = setup({ onReopen: (port) => calls.push(`reopen:${port}`) });
    es.onopen?.({});                       // initial connect — connect() already prefetches
    assert.deepEqual(calls, []);
    es.onerror?.({});                      // transient drop, internal retry
    es.onopen?.({});                       // stream re-established — gap events were lost
    assert.deepEqual(calls, ['reopen:3457']);
    es.onopen?.({});                       // every subsequent reopen re-syncs too
    assert.deepEqual(calls, ['reopen:3457', 'reopen:3457']);
});
