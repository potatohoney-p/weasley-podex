import test from 'node:test';
import assert from 'node:assert/strict';
import { DashboardLifecycleManager } from '../../src/manager/lifecycle.js';
import type { HomeMarker } from '../../src/manager/lifecycle-store.js';

function makeInMemoryStore() {
    const markers = new Map<string, HomeMarker>();
    const registry: unknown[] = [];
    return {
        markers,
        registry,
        load: async () => ({ schemaVersion: 1 as const, managerPort: 24576, entries: [] }),
        save: async (entries: unknown[]) => { registry.length = 0; registry.push(...entries); },
        path: () => '/tmp/test-registry.json',
        legacyPath: () => '/tmp/test-legacy.json',
        writeMarker: async (home: string, marker: HomeMarker) => { markers.set(home, marker); },
        readMarker: async (home: string) => markers.get(home) || null,
        deleteMarker: async (home: string) => { markers.delete(home); },
    };
}

test('stopAll("locked-skip") skips instances with protected marker', async () => {
    const store = makeInMemoryStore();
    const killed: number[] = [];
    const lifecycle = new DashboardLifecycleManager({
        managerPort: 24576,
        from: 3457,
        count: 50,
        jawPath: '/usr/bin/true',
        processVerify: {
            isPidAlive: () => true,
            resolveListeningPid: async () => null,
            killPid: (pid: number) => { killed.push(pid); },
            isPortOccupied: async () => false,
        },
    });

    // @ts-expect-error — inject private store for testing
    lifecycle['store'] = store;

    // Simulate two registered instances
    const entry1 = {
        mode: 'detached' as const,
        port: 3457,
        home: '/tmp/.podex-3457',
        pid: 1001,
        startedAt: new Date().toISOString(),
        command: ['jaw', 'serve', '--port', '3457'],
        token: 'tok1',
        stdout: '',
        stderr: '',
        exited: false,
    };
    const entry2 = {
        mode: 'detached' as const,
        port: 3458,
        home: '/tmp/.podex-3458',
        pid: 1002,
        startedAt: new Date().toISOString(),
        command: ['jaw', 'serve', '--port', '3458'],
        token: 'tok2',
        stdout: '',
        stderr: '',
        exited: false,
    };

    // @ts-expect-error — inject registry
    lifecycle['registry'].set(3457, entry1);
    // @ts-expect-error
    lifecycle['registry'].set(3458, entry2);

    // Protect port 3457
    store.markers.set('/tmp/.podex-3457', {
        schemaVersion: 1,
        managedBy: 'podex-dashboard',
        managerPort: 24576,
        port: 3457,
        pid: 1001,
        token: 'tok1',
        startedAt: entry1.startedAt,
        protected: true,
    });

    // Unprotected marker for 3458
    store.markers.set('/tmp/.podex-3458', {
        schemaVersion: 1,
        managedBy: 'podex-dashboard',
        managerPort: 24576,
        port: 3458,
        pid: 1002,
        token: 'tok2',
        startedAt: entry2.startedAt,
    });

    const results = await lifecycle.stopAll('locked-skip');

    const skipped = results.filter(r => r.status === 'skipped');
    const stopped = results.filter(r => r.status !== 'skipped');

    assert.equal(skipped.length, 1, 'one instance should be skipped');
    assert.equal(skipped[0]!.port, 3457, 'protected instance (3457) should be skipped');
    assert.equal(stopped.length, 1, 'one instance should be stopped');
    assert.equal(stopped[0]!.port, 3458, 'unprotected instance (3458) should be stopped');
});

test('stopAll("full") kills even protected instances', async () => {
    const store = makeInMemoryStore();
    const killed: number[] = [];
    const lifecycle = new DashboardLifecycleManager({
        managerPort: 24576,
        from: 3457,
        count: 50,
        jawPath: '/usr/bin/true',
        processVerify: {
            isPidAlive: () => true,
            resolveListeningPid: async () => null,
            killPid: (pid: number) => { killed.push(pid); },
            isPortOccupied: async () => false,
        },
    });

    // @ts-expect-error — inject store
    lifecycle['store'] = store;

    const entry = {
        mode: 'detached' as const,
        port: 3457,
        home: '/tmp/.podex-3457',
        pid: 1001,
        startedAt: new Date().toISOString(),
        command: ['jaw', 'serve', '--port', '3457'],
        token: 'tok1',
        stdout: '',
        stderr: '',
        exited: false,
    };

    // @ts-expect-error
    lifecycle['registry'].set(3457, entry);

    store.markers.set('/tmp/.podex-3457', {
        schemaVersion: 1,
        managedBy: 'podex-dashboard',
        managerPort: 24576,
        port: 3457,
        pid: 1001,
        token: 'tok1',
        startedAt: entry.startedAt,
        protected: true,
    });

    const results = await lifecycle.stopAll('full');
    const skipped = results.filter(r => r.status === 'skipped');
    assert.equal(skipped.length, 0, 'full mode should not skip any instance');
});

test('protectInstance writes protected=true to marker', async () => {
    const store = makeInMemoryStore();
    const lifecycle = new DashboardLifecycleManager({
        managerPort: 24576,
        from: 3457,
        count: 50,
        jawPath: '/usr/bin/true',
    });

    // @ts-expect-error
    lifecycle['store'] = store;

    const entry = {
        mode: 'detached' as const,
        port: 3457,
        home: '/tmp/.podex-3457',
        pid: 1001,
        startedAt: new Date().toISOString(),
        command: ['jaw', 'serve'],
        token: 'tok1',
        stdout: '',
        stderr: '',
        exited: false,
    };

    // @ts-expect-error
    lifecycle['registry'].set(3457, entry);

    store.markers.set('/tmp/.podex-3457', {
        schemaVersion: 1,
        managedBy: 'podex-dashboard',
        managerPort: 24576,
        port: 3457,
        pid: 1001,
        token: 'tok1',
        startedAt: entry.startedAt,
    });

    const result = await lifecycle.protectInstance(3457);
    assert.equal(result, true);
    assert.equal(store.markers.get('/tmp/.podex-3457')?.protected, true);
});

test('unprotectInstance removes protected flag from marker', async () => {
    const store = makeInMemoryStore();
    const lifecycle = new DashboardLifecycleManager({
        managerPort: 24576,
        from: 3457,
        count: 50,
        jawPath: '/usr/bin/true',
    });

    // @ts-expect-error
    lifecycle['store'] = store;

    const entry = {
        mode: 'detached' as const,
        port: 3457,
        home: '/tmp/.podex-3457',
        pid: 1001,
        startedAt: new Date().toISOString(),
        command: ['jaw', 'serve'],
        token: 'tok1',
        stdout: '',
        stderr: '',
        exited: false,
    };

    // @ts-expect-error
    lifecycle['registry'].set(3457, entry);

    store.markers.set('/tmp/.podex-3457', {
        schemaVersion: 1,
        managedBy: 'podex-dashboard',
        managerPort: 24576,
        port: 3457,
        pid: 1001,
        token: 'tok1',
        startedAt: entry.startedAt,
        protected: true,
    });

    const result = await lifecycle.unprotectInstance(3457);
    assert.equal(result, true);
    const marker = store.markers.get('/tmp/.podex-3457');
    assert.equal(marker?.protected, undefined);
});

test('protectInstance returns false for unknown port', async () => {
    const lifecycle = new DashboardLifecycleManager({
        managerPort: 24576,
        from: 3457,
        count: 50,
        jawPath: '/usr/bin/true',
    });

    const result = await lifecycle.protectInstance(9999);
    assert.equal(result, false);
});

