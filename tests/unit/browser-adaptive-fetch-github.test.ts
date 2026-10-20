import test from 'node:test';
import assert from 'node:assert/strict';
import { runAdaptiveFetch } from '../../src/browser/adaptive-fetch/index.js';

const REPOSITORY_URL = 'https://github.com/example/reader-fixture';
const REPOSITORY_API = 'https://api.github.com/repos/example/reader-fixture';
const PAGE = `<html><head><title>Repository guide</title></head><body>${'A readable repository landing page. '.repeat(100)}</body></html>`;

test('GitHub repository URL yields normalized API metadata and evidence', async () => {
    const { result, seen } = await readRepositoryResponse(JSON.stringify({
        full_name: 'example/reader-fixture',
        description: 'An offline repository fixture',
        default_branch: 'main',
        stargazers_count: 12,
        license: { spdx_id: 'MIT' },
        html_url: REPOSITORY_URL,
    }));
    assert.deepEqual(seen, [REPOSITORY_API, REPOSITORY_URL]);
    assert.equal(result.ok, true);
    assert.equal(result.source, 'public_endpoint');
    assert.equal(result.finalUrl, REPOSITORY_API);
    assert.equal(result.title, 'example/reader-fixture');
    assert.match(String(result.content), /Repository: example\/reader-fixture/);
    assert.match(String(result.content), /Default branch: main/);
    assert.match(String(result.content), /License: MIT/);
    assert.deepEqual(result.metadata, {
        endpointLabel: 'github-repo-api', endpointKind: 'github-repo', fullName: 'example/reader-fixture',
    });
    assert.ok((result.evidence as string[]).includes('public-endpoint:github-repo-api'));
});

test('GitHub repository reader rejects malformed API JSON', async () => {
    const seen: string[] = [];
    const result = await runAdaptiveFetch({
        url: REPOSITORY_URL,
        browserMode: 'never',
        allowThirdPartyReader: false,
        trace: true,
    }, {
        fetch: async (input: URL | RequestInfo) => {
            const url = String(input);
            seen.push(url);
            if (url === REPOSITORY_API) {
                return new Response('This is not repository JSON. '.repeat(100), {
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                });
            }
            if (url === REPOSITORY_URL) {
                return new Response('Not found', {
                    status: 404,
                    headers: { 'content-type': 'text/plain' },
                });
            }
            throw new Error(`Unexpected offline fixture request: ${url}`);
        },
    });

    assert.deepEqual(seen, [REPOSITORY_API, REPOSITORY_URL]);
    assert.equal(result.ok, false, 'malformed repository JSON cannot be readable API content');
    assert.equal(result.verdict, 'blocked');
    assert.ok((result.warnings as string[]).includes('github-repo-invalid-response'));
    assert.doesNotMatch(String(result.content), /This is not repository JSON/);
});

test('GitHub repository reader requires an object with a nonempty string name', async (t) => {
    const cases = [
        ['empty body', ''],
        ['null', 'null'],
        ['array', '[]'],
        ['missing name', '{"message":"not repository data"}'],
        ['numeric name', '{"full_name":42}'],
        ['object name', '{"full_name":{"unexpected":"value"}}'],
        ['blank name', '{"full_name":"   "}'],
    ];
    for (const [name, body] of cases) {
        await t.test(name!, async () => {
            const { result } = await readRepositoryResponse(body!);
            assert.equal(result.ok, false);
            assert.ok((result.warnings as string[]).includes('github-repo-invalid-response'));
        });
    }
});

test('GitHub repository rate limits stop the read before alternate requests', async (t) => {
    for (const status of [403, 429]) {
        await t.test(`HTTP ${status}`, async () => {
            const { result, seen } = await readRepositoryResponse(
                '{"message":"API rate limit exceeded. private-fixture-marker"}',
                status,
                { 'retry-after': '120', 'x-fixture-secret': 'private-fixture-marker' },
                `<html><body>${'A readable repository landing page. '.repeat(100)}</body></html>`,
                200,
            );
            assert.deepEqual(seen, [REPOSITORY_API], 'a denied API read must not try the HTML route');
            assert.equal(result.ok, false);
            assert.equal(result.verdict, 'blocked');
            assert.equal(result.source, 'public_endpoint');
            assert.equal(result.finalUrl, REPOSITORY_API);
            assert.ok((result.warnings as string[]).includes('github-repo-rate-limited'));
            assert.equal((result.metadata as Record<string, unknown>).retryAfterSeconds, 120);
            assert.doesNotMatch(JSON.stringify(result), /private-fixture-marker/);
        });
    }
});

test('GitHub repository reader reports validated server timing without response secrets', async () => {
    const { result, seen } = await readRepositoryResponse(
        '{"message":"private-fixture-marker"}',
        403,
        {
            'retry-after': 'Wed, 21 Oct 2026 07:28:00 GMT',
            'x-ratelimit-remaining': '0',
            'x-ratelimit-reset': '1704067200',
            'x-fixture-secret': 'private-fixture-marker',
        },
    );
    assert.deepEqual(seen, [REPOSITORY_API]);
    assert.deepEqual(result.metadata, {
        endpointLabel: 'github-repo-api',
        endpointKind: 'github-repo',
        error: 'github-repo-rate-limited',
        status: 403,
        retryAfterAt: '2026-10-21T07:28:00.000Z',
        rateLimitResetAt: '2024-01-01T00:00:00.000Z',
    });
    assert.doesNotMatch(JSON.stringify(result), /private-fixture-marker/);
});

test('GitHub repository reader distinguishes an ordinary forbidden response', async () => {
    const { result, seen } = await readRepositoryResponse('{"message":"Resource not accessible"}', 403);
    assert.deepEqual(seen, [REPOSITORY_API]);
    assert.equal(result.ok, false);
    assert.equal(result.verdict, 'blocked');
    assert.ok((result.warnings as string[]).includes('github-repo-forbidden'));
    assert.equal((result.metadata as Record<string, unknown>).error, 'github-repo-forbidden');
    assert.doesNotMatch(String(result.content), /rate limit/i);
});

test('GitHub repository reader omits malformed or overflowing timing headers', async (t) => {
    for (const value of ['-1', '1.5', '1e3', 'Infinity', '9007199254740992', '9'.repeat(1000), 'private-fixture-marker', 'Wed, 32 Oct 2026 07:28:00 GMT']) {
        await t.test(value.slice(0, 32), async () => {
            const { result } = await readRepositoryResponse('not json', 429, {
                'retry-after': value, 'x-ratelimit-reset': value,
            });
            assert.deepEqual(result.metadata, {
                endpointLabel: 'github-repo-api', endpointKind: 'github-repo',
                error: 'github-repo-rate-limited', status: 429,
            });
            assert.doesNotMatch(JSON.stringify(result), /private-fixture-marker/);
        });
    }
    const { result } = await readRepositoryResponse('', 429, {
        'retry-after': '0', 'x-ratelimit-reset': '9007199254740991',
    });
    assert.equal((result.metadata as Record<string, unknown>).retryAfterSeconds, 0);
    assert.equal((result.metadata as Record<string, unknown>).rateLimitResetAt, undefined);
});

test('GitHub repository failure stops even an opted-in alternate reader', async () => {
    const { result, seen } = await readRepositoryResponse('', 429, {}, PAGE, 200, {
        allowThirdPartyReader: true,
        browserSession: 'user',
    });
    assert.deepEqual(seen, [REPOSITORY_API]);
    assert.equal(result.chromeUsed, false);
    assert.deepEqual(result.safetyFlags, [], 'an API denial must not claim that a user session was used');
    assert.equal(result.ok, false);
});

test('GitHub repository denial remains terminal when reading its body fails or times out', { timeout: 5000 }, async (t) => {
    const keepAlive = setTimeout(() => {}, 5000);
    try {
        for (const status of [403, 429]) {
            for (const mode of ['broken stream', 'timeout']) {
                await t.test(`${status} ${mode}`, async () => {
                    const seen: string[] = [];
                    const result = await runAdaptiveFetch({
                        url: REPOSITORY_URL, browserMode: 'never', timeoutMs: 30, trace: true,
                        allowThirdPartyReader: true,
                    }, {
                        fetch: async (input: URL | RequestInfo, init?: RequestInit) => {
                            const url = String(input);
                            seen.push(url);
                            if (url === REPOSITORY_API) return new Response(new ReadableStream({
                                start(controller) {
                                    const fail = () => controller.error(new Error('private-fixture-marker'));
                                    if (mode === 'broken stream' || init?.signal?.aborted) fail();
                                    else init?.signal?.addEventListener('abort', fail, { once: true });
                                },
                            }), {
                                status, headers: { 'content-type': 'application/json', 'retry-after': '120' },
                            });
                            if (url === REPOSITORY_URL) return new Response(PAGE, { headers: { 'content-type': 'text/html' } });
                            throw new Error(`Unexpected offline fixture request: ${url}`);
                        },
                    });
                    assert.deepEqual(seen, [REPOSITORY_API]);
                    assert.equal(result.ok, false);
                    assert.equal(result.verdict, 'blocked');
                    assert.equal((result.metadata as Record<string, unknown>).retryAfterSeconds, 120);
                    assert.ok((result.warnings as string[]).includes('response-body-read-failed'));
                    assert.equal((result.attempts as Array<{ source?: string }>).filter(attempt => attempt.source === 'public_endpoint').length, 1);
                    assert.doesNotMatch(JSON.stringify(result), /private-fixture-marker/);
                });
            }
        }
    } finally {
        clearTimeout(keepAlive);
    }
});

test('body failure from another provider retains generic fallback semantics', async () => {
    const url = 'https://www.npmjs.com/package/offline-fixture';
    const seen: string[] = [];
    const result = await runAdaptiveFetch({ url, browserMode: 'never', trace: true }, {
        fetch: async (input: URL | RequestInfo) => {
            const target = String(input);
            seen.push(target);
            if (target === 'https://registry.npmjs.org/offline-fixture/latest') return new Response(new ReadableStream({
                start(controller) { controller.error(new Error('fixture body failure')); },
            }), { status: 403, headers: { 'content-type': 'application/json' } });
            if (target === 'https://registry.npmjs.org/offline-fixture') return new Response('Not found', {
                status: 404, headers: { 'content-type': 'text/plain' },
            });
            if (target === url) return new Response(PAGE, { headers: { 'content-type': 'text/html' } });
            throw new Error(`Unexpected offline fixture request: ${target}`);
        },
    });
    assert.equal(result.ok, true);
    assert.equal(result.source, 'fetch');
    assert.deepEqual(seen, ['https://registry.npmjs.org/offline-fixture/latest', 'https://registry.npmjs.org/offline-fixture', url]);
    assert.ok((result.attempts as Array<{ reason?: string }>).some(attempt => attempt.reason === 'fixture body failure'));
});

test('GitHub repository 404 and malformed successes retain page fallback', async (t) => {
    for (const [status, body] of [[404, '{"message":"Not Found"}'], [200, 'invalid JSON']] as const) {
        await t.test(`HTTP ${status}`, async () => {
            const { result, seen } = await readRepositoryResponse(body, status, {}, PAGE, 200);
            assert.deepEqual(seen, [REPOSITORY_API, REPOSITORY_URL]);
            assert.equal(result.ok, true);
            assert.equal(result.source, 'fetch');
            assert.equal(result.finalUrl, REPOSITORY_URL);
            assert.match(String(result.content), /readable repository landing page/);
        });
    }
    const { result } = await readRepositoryResponse('{"message":"Not Found"}', 404);
    assert.equal(result.ok, false);
    assert.equal(result.verdict, 'blocked');
    assert.doesNotMatch(JSON.stringify(result), /github-repo-(forbidden|rate-limited)/);
});

test('GitHub repository JSON remains subject to the response byte limit', async () => {
    const { result, seen } = await readRepositoryResponse(
        JSON.stringify({ full_name: 'example/reader-fixture', description: 'x'.repeat(5000) }),
        200, {}, 'Not found', 404, { maxBytes: 64 },
    );
    assert.deepEqual(seen, [REPOSITORY_API, REPOSITORY_URL]);
    assert.equal(result.ok, false);
    assert.doesNotMatch(String(result.content), /Repository: example/);
});

test('GitHub repository timeout still aborts the injected HTTP request', { timeout: 5000 }, async () => {
    const keepAlive = setTimeout(() => {}, 5000);
    const seen: string[] = [];
    let aborted = false;
    try {
        const result = await runAdaptiveFetch({
            url: REPOSITORY_URL, browserMode: 'never', timeoutMs: 30, trace: true,
        }, {
            fetch: async (input: URL | RequestInfo, init?: RequestInit) => {
                const url = String(input);
                seen.push(url);
                if (url === REPOSITORY_URL) return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });
                assert.equal(url, REPOSITORY_API);
                const signal = init?.signal;
                assert.ok(signal);
                return new Promise<Response>((_resolve, reject) => {
                    const fail = () => { aborted = true; reject(new Error('fixture request aborted')); };
                    if (signal.aborted) fail();
                    else signal.addEventListener('abort', fail, { once: true });
                });
            },
        });
        assert.equal(aborted, true);
        assert.deepEqual(seen, [REPOSITORY_API, REPOSITORY_URL]);
        assert.equal(result.ok, false);
        assert.ok((result.attempts as Array<{ reason?: string }>).some(attempt => attempt.reason === 'fixture request aborted'));
    } finally {
        clearTimeout(keepAlive);
    }
});

test('GitHub policy leaves generic JSON, other public endpoints, and raw files unchanged', async (t) => {
    const cases = [
        { name: 'generic JSON', url: 'https://example.com/data.json', endpoints: ['https://example.com/data.json'], status: 200, body: '{"message":"ordinary generic JSON"}', source: 'fetch' },
        { name: 'another provider forbidden fallback', url: 'https://www.npmjs.com/package/offline-fixture', endpoints: ['https://registry.npmjs.org/offline-fixture/latest', 'https://registry.npmjs.org/offline-fixture'], status: 403, body: '{"message":"Forbidden"}', source: 'fetch' },
        { name: 'GitHub raw file', url: 'https://github.com/example/reader-fixture/blob/main/README.md', endpoints: ['https://raw.githubusercontent.com/example/reader-fixture/main/README.md'], status: 200, body: 'Readable raw repository file. '.repeat(100), source: 'public_endpoint' },
    ];
    for (const fixture of cases) {
        await t.test(fixture.name, async () => {
            const seen: string[] = [];
            const result = await runAdaptiveFetch({ url: fixture.url, browserMode: 'never' }, {
                fetch: async (input: URL | RequestInfo) => {
                    const url = String(input);
                    seen.push(url);
                    if (fixture.endpoints.includes(url)) return new Response(fixture.body, {
                        status: fixture.status, headers: { 'content-type': 'application/json' },
                    });
                    if (url === fixture.url) return new Response(fixture.status === 403 ? PAGE : 'Not found', {
                        status: fixture.status === 403 ? 200 : 404, headers: { 'content-type': 'text/html' },
                    });
                    throw new Error(`Unexpected offline fixture request: ${url}`);
                },
            });
            assert.equal(result.ok, true);
            assert.equal(result.source, fixture.source);
            assert.deepEqual(seen, fixture.endpoints.includes(fixture.url) ? fixture.endpoints : [...fixture.endpoints, fixture.url]);
            assert.doesNotMatch(JSON.stringify(result), /github-repo-(forbidden|rate-limited|invalid-response)/);
        });
    }
});

async function readRepositoryResponse(
    body: string,
    status = 200,
    headers: Record<string, string> = {},
    pageBody = 'Not found',
    pageStatus = 404,
    options: Record<string, unknown> = {},
) {
    const seen: string[] = [];
    const result = await runAdaptiveFetch({
        url: REPOSITORY_URL,
        browserMode: 'never',
        allowThirdPartyReader: false,
        trace: true,
        ...options,
    }, {
        fetch: async (input: URL | RequestInfo) => {
            const url = String(input);
            seen.push(url);
            if (url === REPOSITORY_API) {
                return new Response(body, {
                    status,
                    headers: { 'content-type': 'application/json', ...headers },
                });
            }
            if (url === REPOSITORY_URL) {
                return new Response(pageBody, {
                    status: pageStatus,
                    headers: { 'content-type': 'text/html' },
                });
            }
            throw new Error(`Unexpected offline fixture request: ${url}`);
        },
    });
    return { result, seen };
}
