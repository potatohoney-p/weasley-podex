// Multi-Instance Phase 4: launchd multi-instance 검증
import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import {
    computeLaunchdLabel,
    computeLegacyLaunchdLabel,
} from '../../src/manager/launchd-service.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..', '..');

// Replicate instanceId logic for verification
function expectedInstanceId(jawHome: string): string {
    const base = basename(jawHome);
    if ((base === 'podex' && basename(dirname(jawHome)) === '.weasley') || base === '.podex') return 'default';
    const hash = createHash('md5').update(jawHome).digest('hex').slice(0, 8);
    return `${base.replace(/^\./, '')}-${hash}`;
}

test('P4-001: default WEASLEY_PODEX_HOME produces "default" label', () => {
    const result = execSync(
        'node -e "const c = await import(\'./dist/src/core/config.js\'); const { basename } = await import(\'node:path\'); console.log(basename(c.WEASLEY_PODEX_HOME))"',
        { cwd: projectRoot, encoding: 'utf8', env: { ...process.env, WEASLEY_PODEX_HOME: '' } }
    );
    assert.equal(result.trim(), 'podex');
    assert.equal(expectedInstanceId(join(homedir(), '.weasley', 'podex')), 'default');
});

test('P4-002: custom WEASLEY_PODEX_HOME produces hashed label', () => {
    const id = expectedInstanceId('/tmp/jaw-work');
    assert.ok(id.startsWith('jaw-work-'), `Expected jaw-work-<hash>, got ${id}`);
    assert.equal(id.length, 'jaw-work-'.length + 8, 'Hash suffix should be 8 chars');
});

test('P4-003: LABEL format is com.weasley.podex.<instanceId>', () => {
    const defaultHome = join(homedir(), '.weasley', 'podex');
    const defaultLabel = computeLaunchdLabel(3457, defaultHome);
    assert.equal(defaultLabel, 'com.weasley.podex.default');

    const customLabel = computeLaunchdLabel(3458, '/tmp/my-weasley-podex');
    assert.ok(customLabel.startsWith('com.weasley.podex.my-weasley-podex-'));
});

test('P4-003b: legacy launchd label is derived exactly for migration only', () => {
    const home = '/tmp/my-weasley-podex';
    assert.equal(
        computeLegacyLaunchdLabel(3458, home),
        `com.podex.${expectedInstanceId(home)}`,
    );
});

test('P4-003c: managed Weasley homes map to their exact historical launchd labels', () => {
    const root = '/tmp/weasley-user';
    const currentHome = join(root, '.weasley', 'podex-3458');
    const historicalHome = join(root, '.podex-3458');
    assert.equal(
        computeLegacyLaunchdLabel(3458, currentHome),
        `com.podex.${expectedInstanceId(historicalHome)}`,
    );
});

test('P4-003d: a managed default home stays default under a custom home root', () => {
    assert.equal(computeLaunchdLabel(3457, join('/tmp/custom-root', '.weasley', 'podex')), 'com.weasley.podex.default');
});

test('P4-004: xmlEsc escapes &, <, > in paths', () => {
    const xmlEsc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    assert.equal(xmlEsc('/Users/R&D/.jaw'), '/Users/R&amp;D/.jaw');
    assert.equal(xmlEsc('/path/<with>/special'), '/path/&lt;with&gt;/special');
    assert.equal(xmlEsc('/normal/path'), '/normal/path');
});

test('P4-005: parseArgs handles --port=3458 syntax', () => {
    const result = execSync(
        'node --input-type=module -e "import { parseArgs } from \'node:util\'; const { values } = parseArgs({ args: [\'--port=3458\'], options: { port: { type: \'string\', default: \'3457\' } }, strict: false, allowPositionals: true }); console.log(values.port);"',
        { encoding: 'utf8' }
    );
    assert.equal(result.trim(), '3458');
});

test('P4-006: parseArgs handles --port 3458 (space) syntax', () => {
    const result = execSync(
        'node --input-type=module -e "import { parseArgs } from \'node:util\'; const { values } = parseArgs({ args: [\'--port\', \'3458\'], options: { port: { type: \'string\', default: \'3457\' } }, strict: false, allowPositionals: true }); console.log(values.port);"',
        { encoding: 'utf8' }
    );
    assert.equal(result.trim(), '3458');
});

test('P4-007: LOG_DIR uses WEASLEY_PODEX_HOME not hardcoded path', () => {
    const configuredHome = '/tmp/custom-jaw';
    const result = execSync(
        'node -e "const c = await import(\'./dist/src/core/config.js\'); const { join } = await import(\'node:path\'); console.log(join(c.WEASLEY_PODEX_HOME, \'logs\'))"',
        { cwd: projectRoot, encoding: 'utf8', env: { ...process.env, WEASLEY_PODEX_HOME: configuredHome } }
    );
    assert.equal(result.trim(), resolve(configuredHome, 'logs'));
});

