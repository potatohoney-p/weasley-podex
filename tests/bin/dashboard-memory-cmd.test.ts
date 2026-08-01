import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { handleMemory } from '../../bin/commands/dashboard-memory.ts';

interface FakeServer {
    port: number;
    close: () => Promise<void>;
    lastUrl: string;
    lastQuery: Record<string, string>;
}

async function startFake(routeResponses: Record<string, unknown>): Promise<FakeServer> {
    const state: FakeServer = { port: 0, close: async () => {}, lastUrl: '', lastQuery: {} };
    const app = express();
    app.get('/api/dashboard/memory/:sub', (req, res) => {
        state.lastUrl = req.url;
        state.lastQuery = req.query as Record<string, string>;
        const sub = req.params.sub as string;
        res.json(routeResponses[sub] ?? { ok: true });
    });
    return await new Promise(resolve => {
        const server = app.listen(0, '127.0.0.1', () => {
            const addr = server.address();
            const port = typeof addr === 'object' && addr ? addr.port : 0;
            state.port = port;
            state.close = () => new Promise<void>(r => server.close(() => r()));
            resolve(state);
        });
    });
}

// Replace console.log with a buffer-collector during a single test.
function withLogCapture<T>(fn: () => Promise<T>): Promise<{ result: T; output: string }> {
    const original = console.log;
    const lines: string[] = [];
    console.log = (...args: unknown[]) => { lines.push(args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')); };
    return fn().then(result => {
        console.log = original;
        return { result, output: lines.join('\n') };
    }).catch(err => {
        console.log = original;
        throw err;
    });
}

test('cli: help explains L2 read-only scope and embedding default-off behavior', async () => {
    const captured = await withLogCapture(async () => {
        await handleMemory([]);
    });
    assert.match(captured.output, /L2 cross-instance memory search \(read-only\)/);
    assert.match(captured.output, /Companion to `jaw memory` \(L1, instance-local r\/w\)/);
    assert.match(captured.output, /Embedding commands manage an optional dashboard add-on; default OFF unless configured/);
});

test('cli: search forwards q + --instance + --limit to query string', async () => {
    const fake = await startFake({
        search: { hits: [], warnings: [], instancesQueried: 0, instancesSucceeded: 0 },
    });
    process.env["DASHBOARD_PORT"] = String(fake.port);
    try {
        await withLogCapture(async () => {
            await handleMemory(['search', 'hello', 'world', '--instance', '3457,3458', '--limit', '10']);
        });
    } finally {
        await fake.close();
        delete process.env["DASHBOARD_PORT"];
    }
    assert.equal(fake.lastQuery["q"], 'hello world');
    assert.equal(fake.lastQuery["instance"], '3457,3458');
    assert.equal(fake.lastQuery["limit"], '10');
});

test('cli: instances command lists scan-driven entries', async () => {
    const fake = await startFake({
        instances: { ok: true, instances: [
            { instanceId: '3457', label: 'main', homePath: '/h/3457', homeSource: 'default-port', hasDb: true },
            { instanceId: '3458', label: null, homePath: '/h/3458', homeSource: 'profile', hasDb: false },
        ]},
    });
    process.env["DASHBOARD_PORT"] = String(fake.port);
    let output = '';
    try {
        const captured = await withLogCapture(async () => {
            await handleMemory(['instances']);
        });
        output = captured.output;
    } finally {
        await fake.close();
        delete process.env["DASHBOARD_PORT"];
    }
    assert.match(output, /\[3457\] main — \/h\/3457 \(default-port\) ✓/);
    assert.match(output, /\[3458\] \(no label\) — \/h\/3458 \(profile\) ✗ no db/);
});

test('cli: read forwards instance:path correctly', async () => {
    const fake = await startFake({
        read: { ok: true, instanceId: '3457', path: 'profile.md', content: '# Profile content' },
    });
    process.env["DASHBOARD_PORT"] = String(fake.port);
    let output = '';
    try {
        const captured = await withLogCapture(async () => {
            await handleMemory(['read', '3457:profile.md']);
        });
        output = captured.output;
    } finally {
        await fake.close();
        delete process.env["DASHBOARD_PORT"];
    }
    assert.equal(fake.lastQuery["instance"], '3457');
    assert.equal(fake.lastQuery["path"], 'profile.md');
    assert.match(output, /# Profile content/);
});

test('cli: --json passes through JSON', async () => {
    const fake = await startFake({
        instances: { ok: true, instances: [{ instanceId: '3457', label: null, homePath: '/h', homeSource: 'default-port', hasDb: true }] },
    });
    process.env["DASHBOARD_PORT"] = String(fake.port);
    let output = '';
    try {
        const captured = await withLogCapture(async () => {
            await handleMemory(['instances', '--json']);
        });
        output = captured.output;
    } finally {
        await fake.close();
        delete process.env["DASHBOARD_PORT"];
    }
    const parsed = JSON.parse(output);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.instances[0].instanceId, '3457');
});

test('cli: state command reports dashboard embedding state', async () => {
    const fake = await startFake({
        'embed-state': {
            ok: true,
            status: {
                state: 'ACTIVE_HYBRID',
                mode: 'hybrid',
                provider: 'openai',
                model: 'text-embedding-3-small',
                indexedChunks: 42,
                dbSizeBytes: 1024 * 1024,
                lastSyncAt: '2026-05-27T00:00:00.000Z',
            },
        },
    });
    process.env["DASHBOARD_PORT"] = String(fake.port);
    let output = '';
    try {
        const captured = await withLogCapture(async () => {
            await handleMemory(['state']);
        });
        output = captured.output;
    } finally {
        await fake.close();
        delete process.env["DASHBOARD_PORT"];
    }
    assert.equal(fake.lastUrl, '/api/dashboard/memory/embed-state');
    assert.match(output, /State: ACTIVE_HYBRID  Mode: hybrid/);
    assert.match(output, /Provider: openai\/text-embedding-3-small/);
    assert.match(output, /Chunks: 42  DB: 1\.0 MB/);
});

test('cli: estimate command reports dashboard embedding cost estimate', async () => {
    const fake = await startFake({
        'embed-estimate': {
            ok: true,
            totalChunks: 100,
            batches: 5,
            estimatedSeconds: 4,
            estimatedCost: 0.0012,
        },
    });
    process.env["DASHBOARD_PORT"] = String(fake.port);
    let output = '';
    try {
        const captured = await withLogCapture(async () => {
            await handleMemory(['estimate']);
        });
        output = captured.output;
    } finally {
        await fake.close();
        delete process.env["DASHBOARD_PORT"];
    }
    assert.equal(fake.lastUrl, '/api/dashboard/memory/embed-estimate');
    assert.match(output, /Chunks: 100  Batches: 5  ~4s  \$0\.0012/);
});

test('cli: config get reads dashboard embedding config', async () => {
    const fake = await startFake({
        'embed-config': {
            ok: true,
            config: {
                enabled: false,
                provider: 'openai',
                searchMode: 'fts5',
                apiKeyPresent: false,
            },
        },
    });
    process.env["DASHBOARD_PORT"] = String(fake.port);
    let output = '';
    try {
        const captured = await withLogCapture(async () => {
            await handleMemory(['config', 'get']);
        });
        output = captured.output;
    } finally {
        await fake.close();
        delete process.env["DASHBOARD_PORT"];
    }
    assert.equal(fake.lastUrl, '/api/dashboard/memory/embed-config');
    const parsed = JSON.parse(output);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.config.enabled, false);
    assert.equal(parsed.config.searchMode, 'fts5');
});
