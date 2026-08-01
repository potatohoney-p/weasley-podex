import test from 'node:test';
import assert from 'node:assert/strict';
import { setupWebUiDom, resetWebUiDom } from './web-ui-test-dom.ts';

test.afterEach(() => {
    resetWebUiDom();
});

test('renderMarkdown strips scripts and event handlers', async () => {
    setupWebUiDom();
    const { renderMarkdown } = await import('../../public/js/render.ts');

    const html = renderMarkdown('<img src=x onerror=alert(1)><script>alert(1)</script>');

    assert.doesNotMatch(html, /onerror/i);
    assert.doesNotMatch(html, /<script/i);
});

test('sanitizer strips external SVG hrefs and preserves fragment hrefs', async () => {
    setupWebUiDom();
    const { sanitizeHtml } = await import('../../public/js/render.ts');

    const html = sanitizeHtml('<svg><use href="https://evil.example/x"></use><use href="#local"></use></svg>');

    assert.doesNotMatch(html, /https:\/\/evil\.example/);
    assert.match(html, /#local/);
});

test('sanitizeHtml preserves <style> tags with safe CSS', async () => {
    setupWebUiDom();
    const { sanitizeHtml } = await import('../../public/js/render.ts');
    const html = sanitizeHtml('<svg><style>.red { fill: red; }</style><circle class="red"></circle></svg>');
    assert.match(html, /<style>/);
    assert.match(html, /\.red\s*\{/);
});

test('sanitizeHtml strips @import rules from <style>', async () => {
    setupWebUiDom();
    const { sanitizeHtml } = await import('../../public/js/render.ts');
    const html = sanitizeHtml('<style>@import url("https://evil.com/x.css"); .ok { fill: red; }</style>');
    assert.doesNotMatch(html, /evil\.com/);
    assert.match(html, /\/\* stripped \*\//);
    assert.match(html, /\.ok/);
});

test('sanitizeHtml strips @font-face from <style>', async () => {
    setupWebUiDom();
    const { sanitizeHtml } = await import('../../public/js/render.ts');
    const html = sanitizeHtml('<style>@font-face { font-family: "Evil"; src: url("https://evil.com/f.woff"); } .ok { fill: blue; }</style>');
    assert.doesNotMatch(html, /evil\.com/);
    assert.match(html, /\.ok/);
});

test('sanitizeHtml replaces external url() but preserves fragment refs', async () => {
    setupWebUiDom();
    const { sanitizeHtml } = await import('../../public/js/render.ts');
    const html = sanitizeHtml('<svg><style>.bg { background: url("https://evil.com/img.png"); } .grad { fill: url(#myGrad); }</style></svg>');
    assert.doesNotMatch(html, /evil\.com/);
    assert.match(html, /url\(#myGrad\)/);
});

test('sanitizeHtml still blocks <script> tags alongside <style>', async () => {
    setupWebUiDom();
    const { sanitizeHtml } = await import('../../public/js/render.ts');
    const html = sanitizeHtml('<style>.ok { fill: red; }</style><script>alert(1)</script>');
    assert.doesNotMatch(html, /<script/i);
    assert.match(html, /<style>/);
});

test('inline SVG with <style> preserves class and fill definitions', async () => {
    setupWebUiDom();
    const { sanitizeHtml } = await import('../../public/js/render.ts');
    const svg = '<svg viewBox="0 0 100 100"><style>.c { fill: #ff0000; }</style><rect class="c" width="50" height="50"></rect></svg>';
    const result = sanitizeHtml(svg);
    assert.match(result, /<style>/);
    assert.match(result, /class="c"/);
    assert.match(result, /#ff0000/);
});
