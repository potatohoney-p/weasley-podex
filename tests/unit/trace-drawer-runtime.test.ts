import test from 'node:test';
import { mock } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { setupWebUiDom, resetWebUiDom } from './web-ui-test-dom.ts';

const ROOT = resolve(import.meta.dirname, '../..');
const PROVIDER_ICONS_PATH = resolve(ROOT, 'public/js/provider-icons.js');
const originalFetch = globalThis.fetch;

mock.module(PROVIDER_ICONS_PATH, {
    namedExports: {
        providerLabel: (slug: string) => slug,
    },
});

function jsonResponse(data: unknown): Response {
    return new Response(JSON.stringify(data), {
        status: 200,
        headers: { 'content-type': 'application/json' },
    });
}

function apiData(data: unknown): Response {
    return jsonResponse({ ok: true, data });
}

function installScrollIntoView(): void {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
        configurable: true,
        writable: true,
        value: () => { /* noop for jsdom */ },
    });
}

function nextTick(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0));
}

function deferredResponse(): {
    promise: Promise<Response>;
    resolve: (response: Response) => void;
} {
    let resolve!: (response: Response) => void;
    const promise = new Promise<Response>(done => {
        resolve = done;
    });
    return { promise, resolve };
}

test.afterEach(() => {
    globalThis.fetch = originalFetch;
    resetWebUiDom();
});

test('openTraceDrawer loads the page containing the clicked seq and selects it', async () => {
    setupWebUiDom();
    installScrollIntoView();
    const calls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = String(input);
        calls.push(url);
        if (url === '/api/auth/token') return jsonResponse({ token: '' });
        if (url === '/api/traces/tr_run') {
            return apiData({
                id: 'tr_run',
                cli: 'codex',
                model: 'gpt-test',
                agentLabel: 'agent',
                status: 'running',
                rawRetentionStatus: 'available',
                eventCount: 145,
                byteCount: 1000,
                startedAt: 1,
            });
        }
        if (url === '/api/traces/tr_run/events?offset=80&limit=80') {
            return apiData({
                total: 145,
                events: [
                    { seq: 81, source: 'agent', eventType: 'message', preview: 'page start' },
                    { seq: 143, source: 'tool', eventType: 'tool', preview: 'clicked event' },
                ],
            });
        }
        if (url === '/api/traces/tr_run/events/143') {
            return apiData({
                runId: 'tr_run',
                seq: 143,
                source: 'tool',
                eventType: 'tool',
                preview: 'clicked event',
                raw: 'RAW-143',
            });
        }
        throw new Error(`unexpected fetch ${url}`);
    }) as typeof fetch;

    const { openTraceDrawer } = await import('../../public/js/features/trace-drawer.ts');
    await openTraceDrawer('tr_run', 143);
    await nextTick();

    assert.ok(calls.includes('/api/traces/tr_run/events?offset=80&limit=80'));
    assert.equal(calls.includes('/api/traces/tr_run/events?offset=0&limit=80'), false);
    assert.equal(document.getElementById('traceEventRaw')?.textContent, 'RAW-143');
    const selected = document.querySelector<HTMLElement>('.trace-event-row[aria-current="true"]');
    assert.equal(selected?.dataset['seq'], '143');
    assert.equal(selected?.dataset['runId'], 'tr_run');
});

test('stale trace open responses cannot overwrite the newer clicked trace', async () => {
    setupWebUiDom();
    installScrollIntoView();
    const summaryA = deferredResponse();
    const summaryB = deferredResponse();
    const calls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = String(input);
        calls.push(url);
        if (url === '/api/auth/token') return jsonResponse({ token: '' });
        if (url === '/api/traces/tr_a') return summaryA.promise;
        if (url === '/api/traces/tr_b') return summaryB.promise;
        if (url === '/api/traces/tr_b/events?offset=0&limit=80') {
            return apiData({
                total: 10,
                events: [{ seq: 6, source: 'tool', eventType: 'tool', preview: 'new event' }],
            });
        }
        if (url === '/api/traces/tr_b/events/6') {
            return apiData({
                runId: 'tr_b',
                seq: 6,
                source: 'tool',
                eventType: 'tool',
                preview: 'new event',
                raw: 'RAW-B',
            });
        }
        throw new Error(`unexpected fetch ${url}`);
    }) as typeof fetch;

    const { openTraceDrawer } = await import('../../public/js/features/trace-drawer.ts');
    const oldOpen = openTraceDrawer('tr_a', 5);
    const newOpen = openTraceDrawer('tr_b', 6);

    summaryB.resolve(apiData({
        id: 'tr_b',
        cli: 'codex',
        model: 'gpt-test',
        agentLabel: 'new',
        status: 'running',
        rawRetentionStatus: 'available',
        eventCount: 10,
        byteCount: 100,
        startedAt: 2,
    }));
    await newOpen;
    await nextTick();
    assert.equal(document.getElementById('traceEventRaw')?.textContent, 'RAW-B');

    summaryA.resolve(apiData({
        id: 'tr_a',
        cli: 'codex',
        model: 'gpt-test',
        agentLabel: 'old',
        status: 'running',
        rawRetentionStatus: 'available',
        eventCount: 10,
        byteCount: 100,
        startedAt: 1,
    }));
    await oldOpen;
    await nextTick();

    assert.equal(document.getElementById('traceEventRaw')?.textContent, 'RAW-B');
    assert.equal(document.querySelector<HTMLElement>('.trace-event-row')?.dataset['runId'], 'tr_b');
    assert.equal(calls.includes('/api/traces/tr_a/events?offset=0&limit=80'), false);
});
