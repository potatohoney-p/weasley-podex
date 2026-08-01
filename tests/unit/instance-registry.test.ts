import test from 'node:test';
import assert from 'node:assert/strict';
import { InstanceRegistry, computeDiffs } from '../../src/manager/instance-registry.ts';
import { subscribe, type BusEvent } from '../../src/core/event-bus.ts';
import type { DashboardInstance, DashboardScanResult } from '../../src/manager/types.ts';

function makeInstance(port: number, status: string, version: string | null = '1.0.0'): DashboardInstance {
    return { port, status, version, ok: status === 'online', url: `http://localhost:${port}` } as unknown as DashboardInstance;
}

function makeResult(instances: DashboardInstance[]): DashboardScanResult {
    return {
        manager: { port: 24580, rangeFrom: 3457, rangeTo: 3506, checkedAt: '2026-06-10T00:00:00Z' },
        instances,
    } as unknown as DashboardScanResult;
}

test('IR-T1: start runs an immediate scan and fills the snapshot', async () => {
    let scans = 0;
    const registry = new InstanceRegistry({
        scan: async () => { scans++; return makeResult([makeInstance(3457, 'online')]); },
    });
    registry.start(60_000);
    await registry.forceRefresh(); // joins the in-flight initial scan or runs fresh
    registry.stop();
    assert.ok(scans >= 1);
    assert.equal(registry.isReady(), true);
    assert.equal(registry.snapshot()?.instances[0]?.port, 3457);
});

test('IR-T2: computeDiffs detects appeared/disappeared/status/version', () => {
    const prev = new Map([
        [3457, makeInstance(3457, 'online', '1.0.0')],
        [3458, makeInstance(3458, 'online', '1.0.0')],
        [3459, makeInstance(3459, 'online', '1.0.0')],
    ]);
    const next = [
        makeInstance(3457, 'offline', '1.0.0'),   // status change
        makeInstance(3458, 'online', '2.0.0'),    // version change
        makeInstance(3460, 'online'),             // appeared (3459 disappeared)
    ];
    const diffs = computeDiffs(prev, next);
    const byChange = Object.fromEntries(diffs.map(d => [d.change, d]));
    assert.equal(diffs.length, 4);
    assert.equal(byChange['status']!.port, 3457);
    assert.equal(byChange['version']!.port, 3458);
    assert.equal(byChange['disappeared']!.port, 3459);
    assert.equal(byChange['appeared']!.port, 3460);
});

test('IR-T3: diffs publish worker:instance-status-changed to the event-bus', async () => {
    const got: BusEvent[] = [];
    const unsub = subscribe(e => {
        if (e.topic === 'worker' && e.event === 'instance-status-changed') got.push(e);
    });
    let phase = 0;
    const registry = new InstanceRegistry({
        scan: async () => makeResult([makeInstance(3461, phase === 0 ? 'online' : 'offline')]),
    });
    await registry.forceRefresh();   // appeared
    phase = 1;
    await registry.forceRefresh();   // status change
    unsub();
    assert.equal(got.length, 2);
    assert.equal(got[0]!.data['change'], 'appeared');
    assert.equal(got[1]!.data['change'], 'status');
    assert.equal(got[1]!.data['port'], 3461);
});

test('IR-T4: concurrent forceRefresh shares one in-flight scan', async () => {
    let scans = 0;
    const registry = new InstanceRegistry({
        scan: async () => {
            scans++;
            await new Promise(r => setTimeout(r, 30));
            return makeResult([]);
        },
    });
    await Promise.all([registry.forceRefresh(), registry.forceRefresh(), registry.forceRefresh()]);
    assert.equal(scans, 1);
});

test('IR-T5: scan failure keeps the previous snapshot', async () => {
    let fail = false;
    const registry = new InstanceRegistry({
        scan: async () => {
            if (fail) throw new Error('boom');
            return makeResult([makeInstance(3462, 'online')]);
        },
    });
    await registry.forceRefresh();
    fail = true;
    await assert.rejects(() => registry.forceRefresh(), /boom/);
    assert.equal(registry.isReady(), true);
    assert.equal(registry.snapshot()?.instances[0]?.port, 3462);
});

test('IR-T6: onScanResult errors are isolated and stop() clears the timer', async () => {
    const registry = new InstanceRegistry({
        scan: async () => makeResult([]),
        onScanResult: () => { throw new Error('side effect boom'); },
    });
    await assert.doesNotReject(() => registry.forceRefresh());
    registry.start(60_000);
    registry.stop();
    registry.stop(); // idempotent
    assert.equal(registry.isReady(), true);
});
