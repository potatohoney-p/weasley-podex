import test from 'node:test';
import assert from 'node:assert/strict';
import { createProvider, PROVIDER_PRESETS, VALID_PROVIDERS, DEFAULT_EMBEDDING_CONFIG } from '../../src/manager/memory/embedding/provider.ts';
import type { EmbeddingConfig } from '../../src/manager/memory/embedding/provider.ts';

function makeConfig(overrides: Partial<EmbeddingConfig> = {}): EmbeddingConfig {
    return { ...DEFAULT_EMBEDDING_CONFIG, apiKey: 'sk-test', enabled: true, ...overrides };
}

test('VALID_PROVIDERS has 5 entries', () => {
    assert.equal(VALID_PROVIDERS.length, 5);
    assert.deepEqual([...VALID_PROVIDERS], ['openai', 'gemini', 'voyage', 'vertex', 'local']);
});

test('DEFAULT_EMBEDDING_CONFIG has expected shape', () => {
    assert.equal(DEFAULT_EMBEDDING_CONFIG.provider, 'openai');
    assert.equal(DEFAULT_EMBEDDING_CONFIG.model, 'text-embedding-3-small');
    assert.equal(DEFAULT_EMBEDDING_CONFIG.dimensions, 1536);
    assert.equal(DEFAULT_EMBEDDING_CONFIG.searchMode, 'hybrid');
    assert.equal(DEFAULT_EMBEDDING_CONFIG.enabled, false);
});

test('PROVIDER_PRESETS covers all providers', () => {
    for (const p of VALID_PROVIDERS) {
        assert.ok(PROVIDER_PRESETS[p], `preset missing for ${p}`);
        assert.ok(PROVIDER_PRESETS[p]!.model, `model missing for ${p}`);
        assert.ok(PROVIDER_PRESETS[p]!.dimensions > 0, `dimensions invalid for ${p}`);
    }
});

test('createProvider returns provider with correct name for openai', async () => {
    const config = makeConfig({ provider: 'openai' });
    const provider = await createProvider(config);
    assert.equal(provider.name, 'openai');
    assert.equal(provider.model, 'text-embedding-3-small');
    assert.equal(provider.dimensions, 1536);
    assert.equal(provider.maxBatchSize, 20);
});

test('createProvider returns provider with correct name for gemini', async () => {
    const config = makeConfig({ provider: 'gemini', model: 'gemini-embedding-001', dimensions: 768 });
    const provider = await createProvider(config);
    assert.equal(provider.name, 'gemini');
    assert.equal(provider.model, 'gemini-embedding-001');
});

test('createProvider returns provider with correct name for voyage', async () => {
    const config = makeConfig({ provider: 'voyage', model: 'voyage-3-lite', dimensions: 512 });
    const provider = await createProvider(config);
    assert.equal(provider.name, 'voyage');
});

test('createProvider returns provider with correct name for local', async () => {
    const config = makeConfig({ provider: 'local', apiKey: '', model: 'nomic-embed-text', dimensions: 768 });
    const provider = await createProvider(config);
    assert.equal(provider.name, 'local');
    assert.equal(provider.model, 'nomic-embed-text');
});

test('createProvider throws for missing API key on non-local', async () => {
    const config = makeConfig({ provider: 'openai', apiKey: '' });
    await assert.rejects(
        () => createProvider(config),
        { message: /API key required/ },
    );
});

test('createProvider throws for unknown provider', async () => {
    const config = makeConfig({ provider: 'nonexistent' as any });
    await assert.rejects(
        () => createProvider(config),
        { message: /Unknown embedding provider/ },
    );
});

test('createProvider supports env var API key format', async () => {
    process.env['TEST_EMBED_KEY'] = 'sk-from-env';
    const config = makeConfig({ provider: 'openai', apiKey: '$TEST_EMBED_KEY' });
    const provider = await createProvider(config);
    assert.equal(provider.name, 'openai');
    delete process.env['TEST_EMBED_KEY'];
});

test('createProvider vertex with project env var', async () => {
    process.env['VERTEX_PROJECT'] = 'test-project';
    const config = makeConfig({
        provider: 'vertex',
        apiKey: '{"client_email":"test@test.iam","private_key":"fake"}',
        model: 'text-embedding-005',
        dimensions: 768,
    });
    const provider = await createProvider(config);
    assert.equal(provider.name, 'vertex');
    assert.equal(provider.model, 'text-embedding-005');
    delete process.env['VERTEX_PROJECT'];
});

test('openai provider embed calls fetch with correct URL', async (t) => {
    const config = makeConfig({ provider: 'openai' });
    const provider = await createProvider(config);

    const originalFetch = globalThis.fetch;
    t.after(() => { globalThis.fetch = originalFetch; });

    let capturedUrl = '';
    let capturedBody: any = null;
    globalThis.fetch = async (input: any, init: any) => {
        capturedUrl = typeof input === 'string' ? input : input.toString();
        capturedBody = JSON.parse(init?.body as string);
        return new Response(JSON.stringify({
            data: [{ embedding: [0.1, 0.2, 0.3] }],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    const result = await provider.embed(['test text']);
    assert.equal(capturedUrl, 'https://api.openai.com/v1/embeddings');
    assert.deepEqual(capturedBody.input, ['test text']);
    assert.equal(capturedBody.model, 'text-embedding-3-small');
    assert.equal(result.length, 1);
    assert.ok(result[0] instanceof Float32Array);
});

test('gemini provider embed calls correct endpoint', async (t) => {
    const config = makeConfig({ provider: 'gemini', model: 'gemini-embedding-001', dimensions: 768 });
    const provider = await createProvider(config);

    const originalFetch = globalThis.fetch;
    t.after(() => { globalThis.fetch = originalFetch; });

    let capturedUrl = '';
    globalThis.fetch = async (input: any) => {
        capturedUrl = typeof input === 'string' ? input : input.toString();
        return new Response(JSON.stringify({
            data: [{ embedding: [0.1, 0.2] }],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    await provider.embed(['test']);
    assert.ok(capturedUrl.includes('generativelanguage.googleapis.com'));
});

test('provider embed throws on non-ok response', async (t) => {
    const config = makeConfig({ provider: 'openai' });
    const provider = await createProvider(config);

    const originalFetch = globalThis.fetch;
    t.after(() => { globalThis.fetch = originalFetch; });

    globalThis.fetch = async () => new Response('rate limited', { status: 429 });

    await assert.rejects(
        () => provider.embed(['test']),
        { message: /OpenAI embed failed: 429/ },
    );
});
