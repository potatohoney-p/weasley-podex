import test from 'node:test';
import assert from 'node:assert/strict';
import { createDashboardShutdown } from '../../src/manager/shutdown.js';
import type { DashboardLifecycleResult } from '../../src/manager/types.js';

function makeLifecycleResult(port: number, ok = true): DashboardLifecycleResult {
    return {
        ok,
        action: 'stop',
        port,
        status: ok ? 'stopped' : 'error',
        message: ok ? `Stopped ${port}` : `Failed ${port}`,
        home: `/tmp/.podex-${port}`,
        pid: 1000 + port,
        command: ['jaw', 'serve', '--port', String(port)],
        expectedStateAfter: ok ? 'offline' : undefined,
    };
}

test('dashboard shutdown stops managed children before closing preview and server', async () => {
    const calls: string[] = [];
    const shutdown = createDashboardShutdown({
        lifecycle: {
            async stopAll(mode) {
                calls.push(`stopAll:${mode ?? 'default'}`);
                return [makeLifecycleResult(3457)];
            },
        },
        previewProxy: {
            async close() {
                calls.push('preview.close');
            },
        },
        server: {
            close(callback) {
                calls.push('server.close');
                callback?.();
            },
        },
        exit(code) {
            calls.push(`exit:${code}`);
        },
    });

    await shutdown();

    assert.deepEqual(calls, ['stopAll:locked-skip', 'preview.close', 'server.close', 'exit:0']);
});

test('dashboard shutdown logs lifecycle failures and continues cleanup', async () => {
    const calls: string[] = [];
    const warnings: string[] = [];
    const shutdown = createDashboardShutdown({
        lifecycle: {
            async stopAll(mode) {
                calls.push(`stopAll:${mode ?? 'default'}`);
                return [makeLifecycleResult(3457, false)];
            },
        },
        previewProxy: {
            async close() {
                calls.push('preview.close');
            },
        },
        server: {
            close(callback) {
                calls.push('server.close');
                callback?.();
            },
        },
        exit(code) {
            calls.push(`exit:${code}`);
        },
        log: {
            warn(message) {
                warnings.push(message);
            },
            error(message) {
                calls.push(`error:${message}`);
            },
        },
    });

    await shutdown();

    assert.deepEqual(calls, ['stopAll:locked-skip', 'preview.close', 'server.close', 'exit:0']);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0]!, /failed to stop managed Jaw on port 3457/);
});

test('dashboard shutdown logs server close errors and still exits zero', async () => {
    const calls: string[] = [];
    const errors: string[] = [];
    const shutdown = createDashboardShutdown({
        lifecycle: {
            async stopAll(mode) {
                calls.push(`stopAll:${mode ?? 'default'}`);
                return [];
            },
        },
        previewProxy: {
            async close() {
                calls.push('preview.close');
            },
        },
        server: {
            close(callback) {
                calls.push('server.close');
                callback?.(new Error('close failed'));
            },
        },
        exit(code) {
            calls.push(`exit:${code}`);
        },
        log: {
            warn(message) {
                calls.push(`warn:${message}`);
            },
            error(message) {
                errors.push(message);
            },
        },
    });

    await shutdown();

    assert.deepEqual(calls, ['stopAll:locked-skip', 'preview.close', 'server.close', 'exit:0']);
    assert.equal(errors.length, 1);
    assert.match(errors[0]!, /failed to close manager server: close failed/);
});

test('dashboard shutdown skips stopAll when podex_TEST_MODE is set', async () => {
    const calls: string[] = [];
    const warnings: string[] = [];
    const originalEnv = process.env['podex_TEST_MODE'];
    process.env['podex_TEST_MODE'] = '1';
    try {
        const shutdown = createDashboardShutdown({
            lifecycle: {
                async stopAll() {
                    calls.push('stopAll');
                    return [];
                },
            },
            previewProxy: { async close() { calls.push('preview.close'); } },
            server: { close(callback) { calls.push('server.close'); callback?.(); } },
            exit(code) { calls.push(`exit:${code}`); },
            log: {
                warn(message) { warnings.push(message); },
                error() {},
            },
        });

        await shutdown();

        assert.ok(!calls.includes('stopAll'), 'stopAll should not be called in test mode');
        assert.ok(calls.includes('preview.close'));
        assert.ok(calls.includes('server.close'));
        assert.equal(warnings.length, 1);
        assert.match(warnings[0]!, /test mode: skipping stopAll/);
    } finally {
        if (originalEnv === undefined) delete process.env['podex_TEST_MODE'];
        else process.env['podex_TEST_MODE'] = originalEnv;
    }
});

test('dashboard shutdown passes mode parameter to stopAll', async () => {
    const modes: string[] = [];
    const shutdown = createDashboardShutdown({
        lifecycle: {
            async stopAll(mode) {
                modes.push(mode ?? 'undefined');
                return [];
            },
        },
        previewProxy: { async close() {} },
        server: { close(callback) { callback?.(); } },
        exit() {},
    });

    await shutdown('full');
    assert.deepEqual(modes, ['full']);
});

test('dashboard shutdown is idempotent while cleanup is in flight', async () => {
    const calls: string[] = [];
    let releaseStopAll: (() => void) | null = null;
    const shutdown = createDashboardShutdown({
        lifecycle: {
            async stopAll(mode) {
                calls.push(`stopAll:${mode ?? 'default'}`);
                await new Promise<void>(resolve => { releaseStopAll = resolve; });
                return [];
            },
        },
        previewProxy: {
            async close() {
                calls.push('preview.close');
            },
        },
        server: {
            close(callback) {
                calls.push('server.close');
                callback?.();
            },
        },
        exit(code) {
            calls.push(`exit:${code}`);
        },
    });

    const first = shutdown();
    const second = shutdown();
    releaseStopAll?.();
    await Promise.all([first, second]);

    assert.deepEqual(calls, ['stopAll:locked-skip', 'preview.close', 'server.close', 'exit:0']);
});

