import test from 'node:test';
import assert from 'node:assert/strict';
import {
    broadcast,
    addBroadcastListener,
    removeBroadcastListener,
} from '../../src/core/bus.ts';

test('addBroadcastListener receives broadcast events', () => {
    const received = [];
    const fn = (type, data) => received.push({ type, data });

    addBroadcastListener(fn);
    broadcast('test_event', { foo: 'bar' });

    assert.equal(received.length, 1);
    assert.equal(received[0].type, 'test_event');
    assert.deepEqual(received[0].data, { foo: 'bar' });

    removeBroadcastListener(fn);
});

test('removeBroadcastListener stops receiving events', () => {
    const received = [];
    const fn = (type, data) => received.push({ type, data });

    addBroadcastListener(fn);
    broadcast('a', { n: 1 });
    assert.equal(received.length, 1);

    removeBroadcastListener(fn);
    broadcast('b', { n: 2 });
    assert.equal(received.length, 1, 'should not receive after removal');
});

test('broadcast with no listeners does not throw (X-01: no WS server anymore)', () => {
    assert.doesNotThrow(() => broadcast('safe', {}));
});

test('multiple listeners all receive the same broadcast', () => {
    const a = [], b = [];
    const fnA = (type) => a.push(type);
    const fnB = (type) => b.push(type);

    addBroadcastListener(fnA);
    addBroadcastListener(fnB);
    broadcast('multi', {});

    assert.equal(a.length, 1);
    assert.equal(b.length, 1);

    removeBroadcastListener(fnA);
    removeBroadcastListener(fnB);
});

test('removing non-existent listener does not throw', () => {
    assert.doesNotThrow(() => removeBroadcastListener(() => { }));
});
