import test from 'node:test';
import assert from 'node:assert/strict';
import { resetDefuddleBundleCache, runDefuddleInPage } from '../../src/browser/adaptive-fetch/defuddle-extractor.js';
import { collectDefuddleCandidate } from '../../src/browser/adaptive-fetch/browser-escalation.js';

const PARSED_FIXTURE = {
    content: '# Title\n\nBody paragraph.',
    title: 'Title',
    author: 'Author',
    published: '2026-06-10',
    wordCount: 3,
};

// Fake page: evaluateResults queues return values in call order; the first
// evaluate call is the Defuddle-defined probe, later calls run the parse.
function makeFakePage({ evaluateResults = [] as unknown[], addScriptTagError = null as Error | null, noAddScriptTag = false } = {}) {
    const calls = { addScriptTag: 0, evaluate: 0 };
    const queue = [...evaluateResults];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page: any = {
        evaluate: async () => {
            calls.evaluate += 1;
            const next = queue.shift();
            if (next instanceof Error) throw next;
            return next;
        },
    };
    if (!noAddScriptTag) {
        page.addScriptTag = async () => {
            calls.addScriptTag += 1;
            if (addScriptTagError) throw addScriptTagError;
        };
    }
    return { page, calls };
}

test('defuddle extractor returns parsed content via addScriptTag injection', async () => {
    resetDefuddleBundleCache();
    const { page, calls } = makeFakePage({ evaluateResults: [false, PARSED_FIXTURE] });
    const result = await runDefuddleInPage(page);
    assert.equal(result.reason, null);
    assert.ok(result.parsed?.content.includes('Body paragraph'));
    assert.equal(calls.addScriptTag, 1);
});

test('defuddle extractor skips re-injection when already defined', async () => {
    resetDefuddleBundleCache();
    const { page, calls } = makeFakePage({ evaluateResults: [true, PARSED_FIXTURE] });
    const result = await runDefuddleInPage(page);
    assert.equal(result.parsed?.title, 'Title');
    assert.equal(calls.addScriptTag, 0);
});

test('defuddle extractor falls back to evaluate injection on CSP-blocked script tag', async () => {
    resetDefuddleBundleCache();
    const { page } = makeFakePage({
        addScriptTagError: new Error('Refused to execute inline script (CSP)'),
        evaluateResults: [false, undefined, true, PARSED_FIXTURE],
    });
    const result = await runDefuddleInPage(page);
    assert.equal(result.reason, null);
    assert.equal(result.parsed?.wordCount, 3);
});

test('defuddle extractor reports csp-blocked when both injection paths fail', async () => {
    resetDefuddleBundleCache();
    const { page } = makeFakePage({
        addScriptTagError: new Error('CSP'),
        evaluateResults: [false, new Error('unsafe-eval blocked')],
    });
    const result = await runDefuddleInPage(page);
    assert.equal(result.parsed, null);
    assert.equal(result.reason, 'defuddle:csp-blocked');
});

test('defuddle extractor reports empty-content when parse yields nothing', async () => {
    resetDefuddleBundleCache();
    const { page } = makeFakePage({ evaluateResults: [true, { ...PARSED_FIXTURE, content: '   ' }] });
    const result = await runDefuddleInPage(page);
    assert.equal(result.parsed, null);
    assert.equal(result.reason, 'defuddle:empty-content');
});

test('defuddle extractor returns no-evaluate for unsupported pages', async () => {
    const result = await runDefuddleInPage({});
    assert.equal(result.parsed, null);
    assert.equal(result.reason, 'defuddle:no-evaluate');
});

test('collectDefuddleCandidate returns attached candidate or null', () => {
    const candidate = { label: 'browser-defuddle', text: '# md' };
    assert.equal(collectDefuddleCandidate({ defuddleCandidate: candidate }), candidate);
    assert.equal(collectDefuddleCandidate({}), null);
    assert.equal(collectDefuddleCandidate(null), null);
});
