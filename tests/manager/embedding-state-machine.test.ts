import test from 'node:test';
import assert from 'node:assert/strict';
import { getEmbeddingState } from '../../src/manager/memory/embedding/state-machine.ts';
import type { EmbeddingConfig } from '../../src/manager/memory/embedding/provider.ts';

function makeConfig(overrides: Partial<EmbeddingConfig> = {}): EmbeddingConfig {
    return {
        enabled: true,
        provider: 'openai',
        model: 'text-embedding-3-small',
        apiKey: 'sk-test',
        dimensions: 1536,
        searchMode: 'hybrid',
        ...overrides,
    };
}

function makeMockVecStore(opts: {
    totalChunks?: number;
    dbSizeBytes?: number;
    configMap?: Record<string, string>;
} = {}) {
    const configMap = opts.configMap ?? {};
    return {
        getStats: () => ({
            totalChunks: opts.totalChunks ?? 10,
            instances: 1,
            dbSizeBytes: opts.dbSizeBytes ?? 1024,
        }),
        getConfig: (key: string) => configMap[key],
    } as any;
}

test('OFF when settings is null', () => {
    const status = getEmbeddingState({
        settings: null,
        vecStore: null,
        dashboardRunning: true,
        totalSourceChunks: 0,
    });
    assert.equal(status.state, 'OFF');
    assert.equal(status.enabled, false);
    assert.equal(status.reason, 'disabled');
});

test('OFF when enabled is false', () => {
    const status = getEmbeddingState({
        settings: makeConfig({ enabled: false }),
        vecStore: null,
        dashboardRunning: true,
        totalSourceChunks: 0,
    });
    assert.equal(status.state, 'OFF');
    assert.equal(status.enabled, false);
});

test('TEST_FAILED when lastTestResult is fail', () => {
    const status = getEmbeddingState({
        settings: makeConfig(),
        vecStore: null,
        dashboardRunning: true,
        totalSourceChunks: 10,
        lastTestResult: 'fail',
    });
    assert.equal(status.state, 'TEST_FAILED');
    assert.equal(status.fallback, 'fts5');
    assert.equal(status.reason, 'api_test_failed');
});

test('CONFIGURED_NOT_TESTED when never tested and no vecStore', () => {
    const status = getEmbeddingState({
        settings: makeConfig(),
        vecStore: null,
        dashboardRunning: true,
        totalSourceChunks: 10,
        lastTestResult: null,
    });
    assert.equal(status.state, 'CONFIGURED_NOT_TESTED');
    assert.equal(status.reason, 'never_tested');
});

test('DEGRADED_FALLBACK_FTS5 when dashboard not running', () => {
    const status = getEmbeddingState({
        settings: makeConfig(),
        vecStore: makeMockVecStore(),
        dashboardRunning: false,
        totalSourceChunks: 10,
        lastTestResult: 'ok',
    });
    assert.equal(status.state, 'DEGRADED_FALLBACK_FTS5');
    assert.equal(status.fallback, 'fts5');
    assert.equal(status.reason, 'dashboard_not_running');
});

test('DEGRADED_FALLBACK_FTS5 when vecStore is null despite test passing', () => {
    const status = getEmbeddingState({
        settings: makeConfig(),
        vecStore: null,
        dashboardRunning: true,
        totalSourceChunks: 10,
        lastTestResult: 'ok',
    });
    assert.equal(status.state, 'DEGRADED_FALLBACK_FTS5');
    assert.equal(status.fallback, 'fts5');
    assert.equal(status.reason, 'vecstore_unavailable');
});

test('INDEXING when isIndexing is true', () => {
    const status = getEmbeddingState({
        settings: makeConfig(),
        vecStore: makeMockVecStore({ totalChunks: 5 }),
        dashboardRunning: true,
        totalSourceChunks: 10,
        lastTestResult: 'ok',
        isIndexing: true,
    });
    assert.equal(status.state, 'INDEXING');
    assert.equal(status.indexedChunks, 5);
});

test('NEEDS_REINDEX when stored provider differs', () => {
    const status = getEmbeddingState({
        settings: makeConfig({ provider: 'openai' }),
        vecStore: makeMockVecStore({ configMap: { provider: 'gemini' } }),
        dashboardRunning: true,
        totalSourceChunks: 10,
        lastTestResult: 'ok',
    });
    assert.equal(status.state, 'NEEDS_REINDEX');
    assert.equal(status.reason, 'provider_changed');
});

test('NEEDS_REINDEX when stored model differs', () => {
    const status = getEmbeddingState({
        settings: makeConfig({ provider: 'openai', model: 'text-embedding-3-large' }),
        vecStore: makeMockVecStore({
            configMap: { provider: 'openai', model: 'text-embedding-3-small' },
        }),
        dashboardRunning: true,
        totalSourceChunks: 10,
        lastTestResult: 'ok',
    });
    assert.equal(status.state, 'NEEDS_REINDEX');
    assert.equal(status.reason, 'model_changed');
});

test('CONFIGURED_NOT_TESTED when chunks exist but never indexed', () => {
    const status = getEmbeddingState({
        settings: makeConfig(),
        vecStore: makeMockVecStore({ totalChunks: 0, configMap: { provider: 'openai' } }),
        dashboardRunning: true,
        totalSourceChunks: 10,
        lastTestResult: 'ok',
    });
    assert.equal(status.state, 'CONFIGURED_NOT_TESTED');
    assert.equal(status.reason, 'never_indexed');
});

test('PARTIALLY_INDEXED when indexed < source', () => {
    const status = getEmbeddingState({
        settings: makeConfig(),
        vecStore: makeMockVecStore({ totalChunks: 5, configMap: { provider: 'openai' } }),
        dashboardRunning: true,
        totalSourceChunks: 10,
        lastTestResult: 'ok',
    });
    assert.equal(status.state, 'PARTIALLY_INDEXED');
    assert.equal(status.reason, 'incomplete');
});

test('ACTIVE_HYBRID when fully indexed in hybrid mode', () => {
    const status = getEmbeddingState({
        settings: makeConfig({ searchMode: 'hybrid' }),
        vecStore: makeMockVecStore({
            totalChunks: 10,
            configMap: { provider: 'openai', lastSyncAt: '2026-05-19T00:00:00Z' },
        }),
        dashboardRunning: true,
        totalSourceChunks: 10,
        lastTestResult: 'ok',
    });
    assert.equal(status.state, 'ACTIVE_HYBRID');
    assert.equal(status.active, true);
    assert.equal(status.lastSyncAt, '2026-05-19T00:00:00Z');
});

test('ACTIVE_EMBEDDING when fully indexed in embedding mode', () => {
    const status = getEmbeddingState({
        settings: makeConfig({ searchMode: 'embedding' }),
        vecStore: makeMockVecStore({
            totalChunks: 10,
            configMap: { provider: 'openai', lastSyncAt: '2026-05-19T00:00:00Z' },
        }),
        dashboardRunning: true,
        totalSourceChunks: 10,
        lastTestResult: 'ok',
    });
    assert.equal(status.state, 'ACTIVE_EMBEDDING');
    assert.equal(status.active, true);
    assert.equal(status.mode, 'embedding');
});

test('ACTIVE_HYBRID when searchMode is fts5 but embedding enabled and indexed', () => {
    const status = getEmbeddingState({
        settings: makeConfig({ searchMode: 'fts5' }),
        vecStore: makeMockVecStore({
            totalChunks: 10,
            configMap: { provider: 'openai', lastSyncAt: '2026-05-19T00:00:00Z' },
        }),
        dashboardRunning: true,
        totalSourceChunks: 10,
        lastTestResult: 'ok',
    });
    assert.equal(status.state, 'ACTIVE_HYBRID');
    assert.equal(status.active, true);
});

test('base fields carry provider and model from settings', () => {
    const status = getEmbeddingState({
        settings: makeConfig({ provider: 'voyage', model: 'voyage-3-lite' }),
        vecStore: null,
        dashboardRunning: true,
        totalSourceChunks: 0,
    });
    assert.equal(status.provider, 'voyage');
    assert.equal(status.model, 'voyage-3-lite');
});

test('base fields carry totalChunks from totalSourceChunks', () => {
    const status = getEmbeddingState({
        settings: makeConfig(),
        vecStore: null,
        dashboardRunning: true,
        totalSourceChunks: 42,
        lastTestResult: null,
    });
    assert.equal(status.totalChunks, 42);
});
