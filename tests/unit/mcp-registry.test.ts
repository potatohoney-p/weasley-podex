import assert from 'node:assert/strict';
import {
    mkdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
    fetchMcpRegistry,
    fetchMcpRegistryBundled,
    getBundledMcpRegistryPath,
    setRegistryUrl,
} from '../../lib/mcp/mcp-registry.js';
import { getEmployeeMcpToolSummary } from '../../src/agent/mcp-passthrough.js';

const testHome = process.env['WEASLEY_PODEX_HOME'];
if (!testHome) throw new Error('WEASLEY_PODEX_HOME must be set by the test runner');

const cachePath = join(testHome, 'mcp-registry-cache.json');
const mcpConfigPath = join(testHome, 'mcp.json');
const originalFetch = globalThis.fetch;
const originalRegistryEnv = process.env['WEASLEY_PODEX_MCP_REGISTRY_URL'];

function clearCache(): void {
    rmSync(cachePath, { force: true });
}

function registryPayload(id: string, description = `${id} description`) {
    return {
        version: 1,
        servers: {
            [id]: {
                name: id,
                description,
                category: 'test',
                type: 'remote',
                config: { type: 'http', url: `https://${id}.example.test/mcp` },
                tags: ['test'],
                url: `https://${id}.example.test`,
            },
        },
    };
}

test.after(() => {
    globalThis.fetch = originalFetch;
    setRegistryUrl(undefined);
    clearCache();
    if (originalRegistryEnv === undefined) {
        delete process.env['WEASLEY_PODEX_MCP_REGISTRY_URL'];
    } else {
        process.env['WEASLEY_PODEX_MCP_REGISTRY_URL'] = originalRegistryEnv;
    }
});

test('bundled MCP registry ships a usable official Context7 remote entry', () => {
    const path = getBundledMcpRegistryPath();
    assert.match(path.replaceAll('\\', '/'), /\/mcp-ref\/registry\.json$/);

    const bundled = fetchMcpRegistryBundled();
    const context7 = bundled.entries.find(entry => entry.id === 'context7');
    assert.ok(context7);
    assert.equal(context7.type, 'remote');
    assert.deepEqual(context7.config, {
        type: 'http',
        url: 'https://mcp.context7.com/mcp',
    });
});

test('default registry lookup is offline and non-empty', async () => {
    clearCache();
    setRegistryUrl('');
    delete process.env['WEASLEY_PODEX_MCP_REGISTRY_URL'];
    let fetchCalls = 0;
    globalThis.fetch = (async () => {
        fetchCalls += 1;
        throw new Error('default lookup must not use the network');
    }) as typeof fetch;

    const result = await fetchMcpRegistry();
    assert.equal(fetchCalls, 0);
    assert.ok(result.entries.some(entry => entry.id === 'context7'));
});

test('setRegistryUrl fetches a configured remote and fresh cache wins afterward', async () => {
    clearCache();
    const requestedUrls: string[] = [];
    setRegistryUrl('https://registry.example.test/registry.json');
    globalThis.fetch = (async (input: string | URL | Request) => {
        requestedUrls.push(String(input));
        return Response.json(registryPayload('remote-one'));
    }) as typeof fetch;

    const remote = await fetchMcpRegistry();
    assert.equal(remote.entries[0]?.id, 'remote-one');
    assert.deepEqual(requestedUrls, ['https://registry.example.test/registry.json']);

    setRegistryUrl('https://registry-two.example.test/registry.json');
    const cached = await fetchMcpRegistry();
    assert.equal(cached.entries[0]?.id, 'remote-one');
    assert.equal(requestedUrls.length, 1);
});

test('WEASLEY_PODEX_MCP_REGISTRY_URL configures the optional remote', async () => {
    clearCache();
    setRegistryUrl(undefined);
    process.env['WEASLEY_PODEX_MCP_REGISTRY_URL'] = 'https://env-registry.example.test/registry.json';
    let requestedUrl = '';
    globalThis.fetch = (async (input: string | URL | Request) => {
        requestedUrl = String(input);
        return Response.json(registryPayload('env-remote'));
    }) as typeof fetch;

    const result = await fetchMcpRegistry();
    assert.equal(requestedUrl, process.env['WEASLEY_PODEX_MCP_REGISTRY_URL']);
    assert.equal(result.entries[0]?.id, 'env-remote');
});

test('a failed configured remote uses bundled data before a stale cache', async () => {
    mkdirSync(testHome, { recursive: true });
    writeFileSync(cachePath, JSON.stringify({
        ts: 0,
        entries: [{
            id: 'stale-only',
            name: 'stale-only',
            description: 'stale cache sentinel',
            category: 'test',
            type: 'remote',
            config: { type: 'http', url: 'https://stale.example.test/mcp' },
            tags: [],
            url: 'https://stale.example.test',
        }],
        builtins: [],
    }));
    setRegistryUrl('https://offline.example.test/registry.json');
    globalThis.fetch = (async () => {
        throw new Error('offline');
    }) as typeof fetch;
    const originalWarn = console.warn;
    console.warn = () => undefined;
    try {
        const result = await fetchMcpRegistry();
        assert.ok(result.entries.some(entry => entry.id === 'context7'));
        assert.ok(!result.entries.some(entry => entry.id === 'stale-only'));
    } finally {
        console.warn = originalWarn;
    }
});

test('employee MCP summary uses bundled metadata without personal checkout paths', () => {
    mkdirSync(testHome, { recursive: true });
    writeFileSync(mcpConfigPath, JSON.stringify({
        servers: {
            context7: { type: 'http', url: 'https://mcp.context7.com/mcp' },
        },
    }));

    const summary = getEmployeeMcpToolSummary();
    assert.match(summary, /\*\*context7\*\*: Up-to-date library and framework documentation/);

    const sourceFiles = [
        '../../lib/mcp/mcp-registry.ts',
        '../../src/agent/mcp-passthrough.ts',
        '../../src/routes/settings.ts',
    ].map(relativePath => readFileSync(new URL(relativePath, import.meta.url), 'utf8'));
    for (const source of sourceFiles) {
        assert.doesNotMatch(source, /potatohoney-p\/mcp-ref/);
        assert.doesNotMatch(source, /Developer[\\/]+new[\\/]+700_projects/);
    }
});
