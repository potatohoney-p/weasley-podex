import test from 'node:test';
import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { checkWebUiBuildOutput } from '../../scripts/check-web-ui-build-output.ts';

function makeDist(indexHtml: string, appJs: string): string {
    const dir = mkdtempSync(join(tmpdir(), 'podex-build-output-'));
    const assets = join(dir, 'assets');
    mkdirSync(assets);
    writeFileSync(join(dir, 'index.html'), indexHtml);
    writeFileSync(join(assets, 'app-test.js'), appJs);
    return dir;
}

test('build output guard passes dynamic mermaid-loader import', () => {
    const dist = makeDist('<script type="module" src="/assets/app-test.js"></script>', 'const m = () => import("./mermaid-loader-abc.js");');
    const result = checkWebUiBuildOutput({ distDir: dist });
    assert.equal(result.ok, true, result.errors.join('\n'));
});

test('build output guard fails eager modulepreload vendor-utils', () => {
    const dist = makeDist('<link rel="modulepreload" href="/assets/vendor-utils-abc.js"><script type="module" src="/assets/app-test.js"></script>', '');
    const result = checkWebUiBuildOutput({ distDir: dist });
    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /modulepreloads vendor-utils/);
});

test('build output guard fails static vendor-utils import', () => {
    const dist = makeDist('<script type="module" src="/assets/app-test.js"></script>', 'import "./vendor-utils-abc.js";');
    const result = checkWebUiBuildOutput({ distDir: dist });
    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /vendor-utils/);
});

test('build output guard fails __vite__mapDeps referencing vendor-mermaid', () => {
    const appJs = 'const deps = __vite__mapDeps(["./vendor-mermaid-abc.js","./chunk-xyz.js"]);';
    const dist = makeDist('<script type="module" src="/assets/app-test.js"></script>', appJs);
    const result = checkWebUiBuildOutput({ distDir: dist });
    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /vendor-mermaid/);
});

test('build output guard fails when entry bytes exceed budget', () => {
    const bigJs = 'x'.repeat(1000);
    const dist = makeDist('<script type="module" src="/assets/app-test.js"></script>', bigJs);
    const result = checkWebUiBuildOutput({ distDir: dist, entryBudgetBytes: 500 });
    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /exceed budget/);
});

test('build output guard fails nested Vite publicDir artifacts', () => {
    const dist = makeDist('<script type="module" src="/assets/app-test.js"></script>', 'console.log("ok");');
    mkdirSync(join(dist, 'dist'));
    writeFileSync(join(dist, 'dist', 'index.html'), '<!doctype html>');
    const result = checkWebUiBuildOutput({ distDir: dist });
    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /Forbidden nested build output/);
});

function runBuildOutputCli(t: TestContext, appJs: string) {
    const fixture = mkdtempSync(join(tmpdir(), 'podex build output #%-'));
    t.after(() => rmSync(fixture, { recursive: true, force: true }));
    const root = resolve(import.meta.dirname, '../..');
    const script = join(fixture, 'check-web-ui-build-output.ts');
    copyFileSync(join(root, 'scripts/check-web-ui-build-output.ts'), script);
    writeFileSync(join(fixture, 'package.json'), '{"type":"module"}');
    const dist = join(fixture, 'public', 'dist');
    const assets = join(dist, 'assets');
    mkdirSync(assets, { recursive: true });
    writeFileSync(join(dist, 'index.html'), '<script type="module" src="/assets/app-test.js"></script>');
    writeFileSync(join(assets, 'app-test.js'), appJs);
    writeFileSync(join(assets, 'vendor-mermaid-test.js'), 'export const fixture = true;');
    return spawnSync(process.execPath, [
        join(root, 'node_modules/tsx/dist/cli.mjs'), script,
    ], { cwd: fixture, encoding: 'utf8', timeout: 30_000 });
}

test('build output CLI rejects invalid output from a path needing URL encoding', t => {
    const result = runBuildOutputCli(t, 'import "./vendor-mermaid-test.js";');
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stderr, /references eager vendor-mermaid import/);
});

test('build output CLI reports valid output from a path needing URL encoding', t => {
    const result = runBuildOutputCli(t, 'console.log("ok");');
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /Web UI build output OK \(1 app entries, \d+ bytes\)/);
    assert.equal(result.stderr, '');
});

