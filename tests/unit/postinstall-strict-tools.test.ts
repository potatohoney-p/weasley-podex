import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    shouldRequireCliToolsDuringPostinstall,
} from '../../bin/postinstall.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..', '..');
const postinstallSrc = readFileSync(join(root, 'bin/postinstall.ts'), 'utf8');

test('postinstall exposes strict bundled CLI tools mode for integrated installers', () => {
    assert.ok(postinstallSrc.includes('podex_REQUIRE_CLI_TOOLS'));
    assert.ok(postinstallSrc.includes('shouldRequireCliToolsDuringPostinstall'));
    assert.ok(postinstallSrc.includes('CLI tool install failed'));
    assert.ok(postinstallSrc.includes('failed.push(`${bin} (${pkg})`)'));
});

test('postinstall keeps generic npm install best-effort without strict envs', () => {
    assert.ok(postinstallSrc.includes('shouldInstallCliToolsDuringPostinstall()'));
    assert.ok(postinstallSrc.includes('CLI tool install/update skipped by default'));
});

test('postinstall strict CLI tools env helper accepts explicit and npm-config flags', () => {
    assert.equal(shouldRequireCliToolsDuringPostinstall({}), false);
    assert.equal(shouldRequireCliToolsDuringPostinstall({ podex_REQUIRE_CLI_TOOLS: '1' }), true);
    assert.equal(shouldRequireCliToolsDuringPostinstall({ npm_config_jaw_require_cli_tools: 'true' }), true);
});
