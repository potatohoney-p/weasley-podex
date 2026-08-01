import test from 'node:test';
import assert from 'node:assert/strict';
import { setupWebUiDom, resetWebUiDom } from './web-ui-test-dom.ts';

test.afterEach(() => {
    resetWebUiDom();
});

const diff = `--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,2 +1,2 @@
-old <script>
+new <b>`;

test('explicit diff fence renders native diff viewer', async () => {
    setupWebUiDom();
    const { renderMarkdown } = await import('../../public/js/render.ts');
    const html = renderMarkdown(`\`\`\`diff\n${diff}\n\`\`\``);

    assert.match(html, /class="diff-viewer"/);
    assert.match(html, /diff-add/);
    assert.match(html, /diff-del/);
    assert.match(html, /&lt;script&gt;/);
    assert.doesNotMatch(html, /<script>/);
});

test('no-language unified diff auto-detect renders native diff viewer', async () => {
    setupWebUiDom();
    const { renderMarkdown } = await import('../../public/js/render.ts');
    const html = renderMarkdown(`\`\`\`\n${diff}\n\`\`\``);

    assert.match(html, /class="diff-viewer"/);
    assert.doesNotMatch(html, /<pre><code/);
});

test('non-diff code block remains highlighted code block', async () => {
    setupWebUiDom();
    const { renderMarkdown } = await import('../../public/js/render.ts');
    const html = renderMarkdown('```\nconst x = 1;\n```');

    assert.match(html, /<pre><code/);
    assert.doesNotMatch(html, /class="diff-viewer"/);
});

test('large diffs are capped with omitted footer', async () => {
    setupWebUiDom();
    const { renderDiffViewer } = await import('../../public/js/render/diff-viewer.ts');
    const big = ['--- a/a', '+++ b/a', '@@ -1,1 +1,1 @@', ...Array.from({ length: 900 }, (_, i) => `+line ${i}`)].join('\n');
    const html = renderDiffViewer(big);

    assert.match(html, /diff-omitted/);
    assert.match(html, /103 lines omitted/);
});

