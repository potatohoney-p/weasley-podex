import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { Router, Request, Response, RequestHandler } from 'express';
import { registerEventsRoutes, getSseMetrics, SSE_MAX_BUFFER_BYTES } from '../../src/routes/events.ts';
import { currentSeq, publish } from '../../src/core/event-bus.ts';

function connect(lastId: number, initialBytes = 0, onWrite?: (response: EventEmitter) => void) {
    let handler: ((req: Request, res: Response) => void) | undefined;
    const app = { get(_path: string, _auth: RequestHandler, fn: typeof handler) { handler = fn; } };
    registerEventsRoutes(app as unknown as Router, (() => {}) as RequestHandler);
    const req = Object.assign(new EventEmitter(), { headers: {}, query: { lastEventId: String(lastId) } });
    const writes: string[] = [];
    let ends = 0;
    const res = Object.assign(new EventEmitter(), {
        writableLength: initialBytes,
        writableEnded: false,
        writeHead() {},
        write(frame: string) { writes.push(frame); onWrite?.(this); this.writableLength += Buffer.byteLength(frame); return false; },
        end() { ends++; this.writableEnded = true; this.emit('close'); },
    });
    handler!(req as unknown as Request, res as unknown as Response);
    return { req, res, writes, ends: () => ends, close: () => { req.emit('close'); res.emit('close'); } };
}

test('reconnect stops replay at the buffer threshold and releases capacity exactly once', () => {
    publish('system', 'seed', {});
    const mark = currentSeq();
    for (let i = 0; i < 10; i++) publish('system', 'large_replay', { i, text: 'x'.repeat(400_000) });
    const before = getSseMetrics();
    const client = connect(mark);
    try {
        assert.equal(client.writes.filter(x => x.includes('large_replay')).length, 3);
        assert.equal(client.ends(), 1);
        assert.equal(getSseMetrics().activeConnections, before.activeConnections);
        assert.equal(getSseMetrics().slowClientClosed, before.slowClientClosed + 1);
        const count = client.writes.length;
        publish('system', 'later_live', {});
        assert.equal(client.writes.length, count, 'closed replay must not subscribe to live delivery');
        client.close();
        assert.equal(client.ends(), 1);
        assert.equal(getSseMetrics().activeConnections, before.activeConnections);
    } finally { client.close(); }
});

test('initial connected frame is subject to the same buffer policy', () => {
    const before = getSseMetrics();
    const client = connect(0, SSE_MAX_BUFFER_BYTES);
    try {
        assert.equal(client.ends(), 1);
        assert.equal(client.writes.length, 1);
        assert.equal(getSseMetrics().activeConnections, before.activeConnections);
    } finally { client.close(); }
});

test('gap notification can terminate a saturated connection before live subscription', () => {
    const client = connect(currentSeq() + 100, SSE_MAX_BUFFER_BYTES - Buffer.byteLength(': connected\n\n'));
    try {
        assert.equal(client.ends(), 1);
        assert.equal(client.writes.length, 2);
        assert.ok(client.writes[1]!.includes('replay_gap'));
    } finally { client.close(); }
});

test('heartbeat closes a stalled connection and its timer is removed', context => {
    context.mock.timers.enable({ apis: ['setInterval'] });
    const before = getSseMetrics();
    const client = connect(0);
    try {
        client.res.writableLength = SSE_MAX_BUFFER_BYTES;
        context.mock.timers.tick(15_000);
        assert.equal(client.ends(), 1);
        assert.equal(getSseMetrics().activeConnections, before.activeConnections);
        const count = client.writes.length;
        context.mock.timers.tick(30_000);
        assert.equal(client.writes.length, count);
    } finally { client.close(); context.mock.timers.reset(); }
});

test('healthy replay keeps ordering, topic filtering and live delivery without replay markers', () => {
    publish('system', 'seed', {});
    const mark = currentSeq();
    publish('trace', 'hidden_trace', { secret: 'not public' });
    publish('system', 'visible_replay', { order: 1 });
    const before = getSseMetrics();
    const client = connect(mark);
    try {
        assert.equal(client.ends(), 0);
        assert.equal(getSseMetrics().activeConnections, before.activeConnections + 1);
        assert.equal(getSseMetrics().droppedInternalTopicEvents, before.droppedInternalTopicEvents + 1);
        assert.equal(client.writes.length, 2);
        assert.ok(client.writes[1]!.includes('"sseReplay":true'));
        assert.ok(!client.writes.join('').includes('not public'));
        publish('system', 'visible_live', {});
        assert.ok(client.writes.at(-1)!.includes('visible_live'));
        assert.ok(!client.writes.at(-1)!.includes('sseReplay'));
    } finally { client.close(); }
    assert.equal(getSseMetrics().activeConnections, before.activeConnections);
});


test('synchronous close during a write releases capacity without subscribing', () => {
    const before = getSseMetrics();
    const client = connect(0, 0, response => response.emit('close'));
    assert.equal(client.ends(), 1);
    assert.equal(getSseMetrics().activeConnections, before.activeConnections);
    publish('system', 'after_sync_close', {});
    assert.equal(client.writes.length, 1);
    client.close();
    assert.equal(getSseMetrics().activeConnections, before.activeConnections);
});

test('write exceptions release capacity and preserve the original error', () => {
    const before = getSseMetrics();
    const error = new Error('write failed');
    assert.throws(() => connect(0, 0, () => { throw error; }), candidate => candidate === error);
    assert.equal(getSseMetrics().activeConnections, before.activeConnections);
});
