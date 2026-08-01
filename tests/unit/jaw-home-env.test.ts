// Multi-Instance Phase 2.1-2.2: WEASLEY_PODEX_HOME dynamic 검증
import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { mkdirSync, rmSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { expandHomePath } from '../../src/core/path-expand.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..', '..');

test('P2-001: WEASLEY_PODEX_HOME respects WEASLEY_PODEX_HOME env var', () => {
    const configuredHome = '/tmp/test-weasley-podex';
    const result = execSync(
        'node -e "const c = await import(\'./dist/src/core/config.js\'); console.log(c.WEASLEY_PODEX_HOME)"',
        { cwd: projectRoot, encoding: 'utf8', env: { ...process.env, WEASLEY_PODEX_HOME: configuredHome } }
    );
    assert.equal(result.trim(), resolve(configuredHome));
});

test('P2-002: WEASLEY_PODEX_HOME defaults to ~/.weasley/podex without env var', () => {
    const result = execSync(
        'node -e "const c = await import(\'./dist/src/core/config.js\'); console.log(c.WEASLEY_PODEX_HOME)"',
        { cwd: projectRoot, encoding: 'utf8', env: { ...process.env, WEASLEY_PODEX_HOME: '' } }
    );
    assert.equal(result.trim(), join(homedir(), '.weasley', 'podex'));
});

test('P2-003: --home flag sets WEASLEY_PODEX_HOME for doctor subcommand', () => {
    const tmpHome = resolve('/tmp/test-jaw-p2-003');
    mkdirSync(tmpHome, { recursive: true });
    try {
        const result = execSync(
            `node dist/bin/podex.js --home ${tmpHome} doctor --json`,
            { cwd: projectRoot, encoding: 'utf8' }
        );
        const json = JSON.parse(result);
        const homeCheck = json.checks.find((c: any) => c.name === 'Home directory');
        assert.ok(homeCheck, 'Home directory check should exist');
        assert.equal(homeCheck.detail, tmpHome);
    } finally {
        rmSync(tmpHome, { recursive: true, force: true });
    }
});

test('P2-004: --home=/path equals syntax works', () => {
    const tmpHome = resolve('/tmp/test-jaw-p2-004');
    mkdirSync(tmpHome, { recursive: true });
    try {
        const result = execSync(
            `node dist/bin/podex.js --home=${tmpHome} doctor --json`,
            { cwd: projectRoot, encoding: 'utf8' }
        );
        const json = JSON.parse(result);
        const homeCheck = json.checks.find((c: any) => c.name === 'Home directory');
        assert.equal(homeCheck.detail, tmpHome);
    } finally {
        rmSync(tmpHome, { recursive: true, force: true });
    }
});

test('P2-005: tilde expansion resolves correctly', () => {
    assert.equal(expandHomePath('~/test-tilde', '/home/jaw'), '/home/jaw/test-tilde');
    assert.equal(expandHomePath('~\\test-tilde', 'C:\\Users\\jaw'), 'C:\\Users\\jaw\\test-tilde');
});

test('P23-001: postinstall copies legacy default data without moving or overwriting it', () => {
    const src = readFileSync(join(projectRoot, 'bin/postinstall.ts'), 'utf8');
    const migrationBlock = src.slice(src.indexOf('const legacyHome'), src.indexOf('// 1. Ensure ~/.weasley/podex/ home directory'));
    assert.ok(migrationBlock.includes('!configuredHome'), 'automatic migration must only run for the new default home');
    assert.ok(migrationBlock.includes('destinationPopulated'), 'migration must guard a populated destination');
    assert.ok(migrationBlock.includes('fs.cpSync'), 'migration must copy legacy data');
    assert.equal(migrationBlock.includes('fs.renameSync'), false, 'migration must preserve the legacy home');
    assert.ok(migrationBlock.includes('force: false'), 'migration must not overwrite destination data');
});

test('P23-002: init.ts workingDir default uses WEASLEY_PODEX_HOME, not hardcoded path', () => {
    const src = readFileSync(join(projectRoot, 'bin/commands/init.ts'), 'utf8');
    // Should NOT contain os.homedir() in the workingDir default line
    const workingDirLine = src.split('\n').find(l => l.includes('Working directory'));
    assert.ok(workingDirLine, 'Working directory prompt line should exist');
    assert.ok(workingDirLine.includes('WEASLEY_PODEX_HOME'), 'Default should reference WEASLEY_PODEX_HOME');
    assert.ok(!workingDirLine.includes('os.homedir()'), 'Default should NOT use os.homedir()');
});

test('P23-003: mcp.ts fallback uses WEASLEY_PODEX_HOME, not homedir()', () => {
    const src = readFileSync(join(projectRoot, 'bin/commands/mcp.ts'), 'utf8');
    // getWorkingDir was inlined into the reset case — verify the inlined fallback uses WEASLEY_PODEX_HOME
    assert.ok(!src.includes('function getWorkingDir'), 'getWorkingDir should be removed (inlined)');
    assert.ok(src.includes('catch { workingDir = WEASLEY_PODEX_HOME; }'), 'inlined fallback should use WEASLEY_PODEX_HOME');
});

test('P23-004: --home with subcommand as value produces error', () => {
    assert.throws(
        () => execSync(
            `node dist/bin/podex.js --home clone`,
            { cwd: projectRoot, encoding: 'utf8', stdio: 'pipe' }
        ),
        { status: 1 },
    );
});

test('P23-005: --home without any value produces error', () => {
    assert.throws(
        () => execSync(
            `node dist/bin/podex.js --home`,
            { cwd: projectRoot, encoding: 'utf8', stdio: 'pipe' }
        ),
        { status: 1 },
    );
});

