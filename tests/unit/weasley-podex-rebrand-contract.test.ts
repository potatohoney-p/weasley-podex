import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (path: string): string => readFileSync(join(root, path), 'utf8');

test('package metadata exposes only the Weasley Podex CLI', () => {
    const pkg = JSON.parse(read('package.json'));
    assert.equal(pkg.name, 'weasley-podex');
    assert.equal(pkg.author, 'Weasley Contributors');
    assert.equal(pkg.license, 'Apache-2.0');
    assert.equal(pkg.bin['weasley-podex'], 'dist/bin/podex.js');
    assert.deepEqual(Object.keys(pkg.bin), ['weasley-podex']);
    assert.equal(existsSync(join(root, 'bin/podex-legacy.ts')), false);
    assert.equal(existsSync(join(root, 'bin/jaw-legacy.ts')), false);
    assert.equal(existsSync(join(root, 'bin/podex')), false);
    assert.equal(existsSync(join(root, 'bin/jaw')), false);
});

test('new data home is primary and legacy data is copied safely', () => {
    const config = read('src/core/config.ts');
    assert.match(config, /getWeasleyPodexEnv\('HOME'/);
    assert.match(config, /'\.weasley', 'podex'/);
    assert.match(config, /fs\.cpSync\(LEGACY_PODEX_HOME, WEASLEY_PODEX_HOME/);
    assert.match(config, /force: false/);
    assert.doesNotMatch(config, /renameSync\(LEGACY_PODEX_HOME/);
});

test('source serve cannot execute a fake root server pointer', () => {
    assert.equal(existsSync(join(root, 'server.js')), false);
    const serve = read('bin/commands/serve.ts');
    assert.match(serve, /fs\.existsSync\(serverJs\) && !fs\.existsSync\(serverTs\)/);
});

test('MCP installers use argument arrays and derive target totals', () => {
    const command = read('bin/commands/mcp.ts');
    const installer = read('lib/mcp/mcp-install.ts');
    assert.doesNotMatch(command, /\bexecSync\s*\(/);
    assert.doesNotMatch(installer, /\bexecSync\s*\(/);
    assert.match(command, /execFileSync\(command, args/);
    assert.match(command, /Object\.keys\(syncResults\)\.length/);
    assert.doesNotMatch(command, /6개 CLI|6 CLI/);
});

test('only the generated product mark remains in packaged product assets', () => {
    for (const path of [
        'public/assets/weasley-podex-mark.png',
        'electron/build/weasley-podex-mark.png',
        'docs/assets/weasley-podex-mark.png',
        'LICENSE',
        'NOTICE',
    ]) assert.equal(existsSync(join(root, path)), true, `${path} must exist`);

    for (const path of [
        'public/assets/shark.svg',
        'public/img/shark-sprite.png',
        'public/icons/icon-192.png',
        'electron/build/tray-shark.svg',
        'electron/build/icon.png',
        'docs/demo.mp4',
        'docs/podex-intro.mp4',
        'docs/podex-intro.html',
    ]) assert.equal(existsSync(join(root, path)), false, `${path} must be removed`);
});
