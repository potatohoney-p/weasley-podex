import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..', '..');
const installerSrc = fs.readFileSync(join(root, 'scripts/install-wsl.sh'), 'utf8');
const doctorSrc = fs.readFileSync(join(root, 'bin/commands/doctor.ts'), 'utf8');
const verifierSrc = fs.readFileSync(join(root, 'scripts/verify-fresh-install.sh'), 'utf8');

test('WSL installer configures user-local npm prefix', () => {
    assert.ok(installerSrc.includes('npm config set prefix "$prefix"'));
    assert.ok(installerSrc.includes('NPM_PATH_LINE=\'export PATH="$HOME/.local/bin:$PATH"\''));
    assert.ok(installerSrc.includes('configure_bash_path_profiles'));
    assert.ok(installerSrc.includes('[ -f "$HOME/.bash_profile" ] && add_npm_path_to_profile "$HOME/.bash_profile"'));
    assert.ok(installerSrc.includes('[ -f "$HOME/.bash_login" ] && add_npm_path_to_profile "$HOME/.bash_login"'));
    assert.ok(installerSrc.includes('add_npm_path_to_profile "$HOME/.profile"'));
    assert.ok(installerSrc.includes('link_node_tools_to_local_bin'));
    assert.ok(installerSrc.includes('type -P -a "$tool"'));
    assert.ok(installerSrc.includes('ln -sfn "$target" "$link"'));
    assert.equal(installerSrc.includes('[ -f "$HOME/.zshrc" ] && profile="$HOME/.zshrc"'), false);
});

test('WSL installer treats Node and npm as a WSL-native toolchain', () => {
    assert.ok(installerSrc.includes('wsl_npm_is_usable()'), 'install-wsl.sh should have a WSL npm usability helper');
    assert.ok(installerSrc.includes('npm_path="$(command -v npm 2>/dev/null || true)"'));
    assert.ok(installerSrc.includes('/mnt/*) return 1 ;;'), 'Windows npm paths must not satisfy WSL npm checks');
    assert.ok(installerSrc.includes('npm --version >/dev/null 2>&1'), 'npm must be runnable, not just present');
    assert.ok(installerSrc.includes('Node is WSL-native but npm is missing — reinstalling...'));
    assert.ok(installerSrc.includes('Node is WSL-native but npm resolves to Windows'));
    assert.ok(installerSrc.includes('Node.js $(node -v) with npm $(npm --version) ready'),
        'success output should include both node and npm versions');
});

test('WSL installer makes jaw and bundled CLI tools available immediately', () => {
    assert.ok(installerSrc.includes('podex_INSTALL_CLI_TOOLS=1'));
    assert.equal(installerSrc.includes('podex_REQUIRE_CLI_TOOLS=1'), false);
    assert.equal(installerSrc.includes('podex_REQUIRE_OFFICECLI=1'), false);
    assert.ok(installerSrc.includes('verify_jaw_command'));
    assert.ok(installerSrc.includes('command -v jaw'));
    assert.ok(installerSrc.includes('jaw --version >/dev/null 2>&1 || fail "jaw is on PATH but failed to run"'));
    assert.ok(installerSrc.includes('hash -r 2>/dev/null || true'));
    assert.equal(installerSrc.includes("|| echo 'done'"), false);
    assert.ok(installerSrc.includes('podex_SOURCE_ONLY'));
});

test('WSL installer installs browser helpers', () => {
    assert.ok(installerSrc.includes('npm install -g playwright-core'));
    assert.ok(installerSrc.includes('install-browser') === false);
});

test('WSL installer runs doctor in main', () => {
    const mainBlock = installerSrc.slice(installerSrc.indexOf('main() {'));
    assert.ok(mainBlock.includes('run_doctor'), 'main should invoke run_doctor');
});

test('fresh install verifier checks the supported WSL bash login shell path', () => {
    assert.ok(verifierSrc.includes('is_wsl()'));
    assert.ok(verifierSrc.includes('WSL bash login shell cannot resolve node/npm/jaw'));
    assert.ok(verifierSrc.includes('bash -lc'));
    assert.ok(verifierSrc.includes('jaw --version'));
});

test('doctor exposes WSL permission and OfficeCLI checks', () => {
    assert.ok(doctorSrc.includes("check('WSL sudo'"));
    assert.ok(doctorSrc.includes("check('npm global prefix'"));
    assert.ok(doctorSrc.includes("name: 'OfficeCLI'"));
    assert.ok(doctorSrc.includes('verifyOfficeCli'));
    assert.ok(doctorSrc.includes("execFileSync(candidate, ['--version']"));
    assert.ok(doctorSrc.includes('sudoNonInteractive'));
    assert.ok(doctorSrc.includes('npmPrefix'));
});
