import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePublicEndpointCandidates } from '../../src/browser/adaptive-fetch/endpoint-resolvers.js';
import { runAdaptiveFetch } from '../../src/browser/adaptive-fetch/index.js';

test('GitHub subpages do not resolve to repository summary endpoints', () => {
    for (const path of [
        'issues', 'issues/42', 'pull/42', 'pull/42/files', 'discussions/42',
        'releases', 'releases/tag/v1.0', 'tree/main/docs', 'wiki/Setup',
        'commit/abc123', 'compare/main...feature', 'actions/runs/42',
        'blob/main',
    ]) {
        const url = `https://github.com/example/project/${path}?view=all#details`;
        assert.deepEqual(resolvePublicEndpointCandidates(url), [], url);
    }
});

test('GitHub repository roots and blob files retain their public endpoints', () => {
    for (const suffix of ['', '/', '?tab=readme-ov-file#readme', '/?tab=readme-ov-file']) {
        assert.deepEqual(resolvePublicEndpointCandidates(`https://github.com/example/project${suffix}`), [{
            label: 'github-repo-api',
            url: 'https://api.github.com/repos/example/project',
            source: 'public_endpoint',
        }]);
    }
    assert.deepEqual(resolvePublicEndpointCandidates('https://github.com/example/project/blob/main/docs/Guide%20One.md#L2'), [{
        label: 'github-raw',
        url: 'https://raw.githubusercontent.com/example/project/main/docs/Guide%20One.md',
        source: 'public_endpoint',
    }]);
});

const repositorySummary = {
    id: 123,
    full_name: 'example/project',
    description: 'Repository overview unrelated to the requested issue or pull request. '.repeat(30),
    default_branch: 'main',
    html_url: 'https://github.com/example/project',
    stargazers_count: 12,
    forks_count: 2,
    open_issues_count: 3,
};

for (const resource of ['issues/42', 'pull/42']) {
    test(`GitHub ${resource} returns requested page content instead of a higher-scoring repository summary`, async () => {
        const url = `https://github.com/example/project/${resource}`;
        const seen: string[] = [];
        const result = await runAdaptiveFetch({ url, browserMode: 'never', trace: true }, {
            fetch: async (input: URL | RequestInfo) => {
                const requested = String(input);
                seen.push(requested);
                if (requested === 'https://api.github.com/repos/example/project') {
                    return new Response(JSON.stringify(repositorySummary), { headers: { 'content-type': 'application/json' } });
                }
                assert.equal(requested, url);
                return new Response('<html><head><title>Issue or PR details</title></head><body><p>Requested discussion content: a reproducible defect and its proposed correction.</p></body></html>', {
                    headers: { 'content-type': 'text/html' },
                });
            },
        });
        assert.equal(result.ok, true);
        assert.equal(result.finalUrl, url);
        assert.match(result.content, /Requested discussion content/);
        assert.doesNotMatch(result.content, /Repository overview/);
        assert.deepEqual(seen, [url]);
    });
}

test('a missing GitHub issue cannot be reported as a successful repository read', async () => {
    const url = 'https://github.com/example/project/issues/404';
    const seen: string[] = [];
    const result = await runAdaptiveFetch({ url, browserMode: 'never', trace: true }, {
        fetch: async (input: URL | RequestInfo) => {
            const requested = String(input);
            seen.push(requested);
            if (requested === 'https://api.github.com/repos/example/project') {
                return new Response(JSON.stringify(repositorySummary), { headers: { 'content-type': 'application/json' } });
            }
            assert.equal(requested, url);
            return new Response('The requested issue does not exist.', { status: 404, headers: { 'content-type': 'text/plain' } });
        },
    });
    assert.equal(result.ok, false);
    assert.equal(result.finalUrl, url);
    assert.doesNotMatch(result.content, /Repository overview/);
    assert.deepEqual(seen, [url]);
});
