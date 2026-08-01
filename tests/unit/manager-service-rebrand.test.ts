import test from 'node:test';
import assert from 'node:assert/strict';
import {
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateLaunchdPlist } from '../../src/core/launchd-plist.ts';
import {
    computeLaunchdLabel,
    computeLegacyLaunchdLabel,
    isConfirmedLaunchdStopped,
    isManagedLaunchdPlist,
} from '../../src/manager/launchd-service.ts';
import {
    computeLegacyUnitName,
    computeUnitName,
    isConfirmedSystemdStopped,
    isManagedSystemdUnit,
} from '../../src/manager/systemd-service.ts';
import {
    isManagedDashboardPlist,
    isManagedDashboardUnit,
} from '../../src/manager/dashboard-service.ts';

const root = mkdtempSync(join(tmpdir(), 'weasley-service-rebrand-'));
test.after(() => rmSync(root, { recursive: true, force: true }));

function q(value: string): string {
    return value.includes(' ') ? `"${value}"` : value;
}

function instanceUnit(unitName: string, home: string, port: number, legacy = false): string {
    return `[Unit]
Description=${legacy ? 'podex' : 'Weasley Podex'} Server (${unitName})

[Service]
ExecStart=/usr/bin/node /opt/weasley/podex.js --home ${q(home)} serve --port ${port} --no-open
Environment=${legacy ? 'podex_HOME' : 'WEASLEY_PODEX_HOME'}=${q(home)}
`;
}

function dashboardPlist(label: string, home: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<plist><dict>
<key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array>
<string>/usr/bin/node</string><string>/opt/weasley/podex.js</string>
<string>dashboard</string><string>serve</string>
<string>--port</string><string>3456</string>
<string>--from</string><string>3457</string>
<string>--count</string><string>10</string><string>--no-open</string>
</array>
<key>WEASLEY_PODEX_HOME</key><string>${home}</string>
</dict></plist>`;
}

function dashboardUnit(label: string, home: string, legacy = false): string {
    return `[Unit]
Description=${legacy ? 'podex' : 'Weasley Podex'} Dashboard Server

[Service]
WorkingDirectory=${q(home)}
ExecStart=/usr/bin/node /opt/weasley/podex.js dashboard serve --port 3456 --from 3457 --count 10 --no-open
Environment=${legacy ? 'podex_HOME' : 'WEASLEY_PODEX_HOME'}=${q(home)}
SyslogIdentifier=${label}
`;
}

test('instance launchd ownership verifies label, home and port together', () => {
    const home = join(root, 'instance-home');
    const port = 3458;
    const label = computeLaunchdLabel(port, home);
    const path = join(root, `${label}.plist`);
    writeFileSync(path, generateLaunchdPlist({
        label,
        port: String(port),
        nodePath: '/usr/bin/node',
        jawPath: '/opt/weasley/podex.js',
        jawHome: home,
        logDir: join(home, 'logs'),
        servicePath: '/usr/bin',
    }));
    assert.equal(isManagedLaunchdPlist(path, label, port, home), true);
    assert.equal(isManagedLaunchdPlist(path, label, port + 1, home), false);

    const forged = readFileSync(path, 'utf8').replaceAll(home, join(root, 'other-home'));
    writeFileSync(path, forged);
    assert.equal(isManagedLaunchdPlist(path, label), false);
});

test('legacy launchd ownership accepts only its derived historical home', () => {
    const home = join(root, '.podex-3458');
    const port = 3458;
    const label = computeLegacyLaunchdLabel(port, home);
    const path = join(root, `${label}.plist`);
    const content = generateLaunchdPlist({
        label,
        port: String(port),
        nodePath: '/usr/bin/node',
        jawPath: '/opt/weasley/podex.js',
        jawHome: home,
        logDir: join(home, 'logs'),
        servicePath: '/usr/bin',
    }).replaceAll('WEASLEY_PODEX_HOME', 'podex_HOME');
    writeFileSync(path, content);
    assert.equal(isManagedLaunchdPlist(path, label, port, home), true);
});

test('instance systemd ownership verifies filename, home and port together', () => {
    const home = join(root, 'systemd-home');
    const port = 3459;
    const unitName = computeUnitName(port, home);
    const path = join(root, `${unitName}.service`);
    writeFileSync(path, instanceUnit(unitName, home, port));
    assert.equal(isManagedSystemdUnit(path, unitName, port, home), true);
    assert.equal(isManagedSystemdUnit(path, unitName, port + 1, home), false);

    writeFileSync(path, instanceUnit(unitName, join(root, 'other-home'), port));
    assert.equal(isManagedSystemdUnit(path), false);
});

test('legacy systemd ownership accepts the exact derived unit only', () => {
    const home = join(root, '.podex-3460');
    const port = 3460;
    const unitName = computeLegacyUnitName(port, home);
    const path = join(root, `${unitName}.service`);
    writeFileSync(path, instanceUnit(unitName, home, port, true));
    assert.equal(isManagedSystemdUnit(path, unitName, port, home), true);
});

test('dashboard ownership rejects exact-name files that target another home', () => {
    const currentHome = join(homedir(), '.weasley', 'podex');
    const legacyHome = join(homedir(), '.podex');
    const currentPlist = join(root, 'com.weasley.podex.dashboard.plist');
    const legacyPlist = join(root, 'com.podex.dashboard.plist');
    writeFileSync(currentPlist, dashboardPlist('com.weasley.podex.dashboard', currentHome));
    writeFileSync(legacyPlist, dashboardPlist('com.podex.dashboard', legacyHome));
    assert.equal(isManagedDashboardPlist(currentPlist, 'com.weasley.podex.dashboard'), true);
    assert.equal(isManagedDashboardPlist(legacyPlist, 'com.podex.dashboard'), true);
    writeFileSync(legacyPlist, dashboardPlist('com.podex.dashboard', join(root, 'other-home')));
    assert.equal(isManagedDashboardPlist(legacyPlist, 'com.podex.dashboard'), false);

    const currentUnit = join(root, 'weasley-podex-dashboard.service');
    const legacyUnit = join(root, 'jaw-dashboard.service');
    writeFileSync(currentUnit, dashboardUnit('weasley-podex-dashboard', currentHome));
    writeFileSync(legacyUnit, dashboardUnit('jaw-dashboard', legacyHome, true));
    assert.equal(isManagedDashboardUnit(currentUnit, 'weasley-podex-dashboard'), true);
    assert.equal(isManagedDashboardUnit(legacyUnit, 'jaw-dashboard'), true);
    writeFileSync(legacyUnit, dashboardUnit('jaw-dashboard', join(root, 'other-home'), true));
    assert.equal(isManagedDashboardUnit(legacyUnit, 'jaw-dashboard'), false);
});

test('migration rollback removes a failed new file or restores its previous content', () => {
    const launchd = readFileSync(join(process.cwd(), 'src', 'manager', 'launchd-service.ts'), 'utf8');
    const systemd = readFileSync(join(process.cwd(), 'src', 'manager', 'systemd-service.ts'), 'utf8');
    const dashboard = readFileSync(join(process.cwd(), 'src', 'manager', 'dashboard-service.ts'), 'utf8');
    for (const source of [launchd, systemd, dashboard]) {
        assert.match(source, /previous(?:Plist|Unit)/);
        assert.match(source, /failed registration left no durable file/);
    }
});

test('activation rollback confirms the new service is stopped before restarting one previous service', () => {
    const launchd = readFileSync(join(process.cwd(), 'src', 'manager', 'launchd-service.ts'), 'utf8');
    const systemd = readFileSync(join(process.cwd(), 'src', 'manager', 'systemd-service.ts'), 'utf8');
    const dashboard = readFileSync(join(process.cwd(), 'src', 'manager', 'dashboard-service.ts'), 'utf8');

    assert.match(
        launchd,
        /if \(code !== 0\) \{[\s\S]*?ensureLaunchdStopped\(label\)[\s\S]*?if \(rollbackStop\.ok\)[\s\S]*?previous service was not restarted/,
    );
    assert.match(
        systemd,
        /rollbackActivation[\s\S]*?ensureSystemdStopped\(unitName\)[\s\S]*?if \(!rollbackStop\.ok\)[\s\S]*?previous service was not restarted/,
    );
    assert.match(
        dashboard,
        /catch \(error\) \{[\s\S]*?ensureStopped\(LABEL_LAUNCHD\)[\s\S]*?restorePlistFile\(\)[\s\S]*?if \(rollbackStopped\)/,
    );
    assert.match(
        dashboard,
        /catch \(error\) \{[\s\S]*?ensureStopped\(LABEL_SYSTEMD\)[\s\S]*?restoreUnitFile\(\)[\s\S]*?if \(rollbackStopped && reloaded\)/,
    );
});

test('launchd rollback fails closed on timeout or spawn ambiguity', () => {
    assert.equal(isConfirmedLaunchdStopped({ code: 1, definitiveExit: true, timedOut: false }), true);
    assert.equal(isConfirmedLaunchdStopped({ code: 1, definitiveExit: false, timedOut: false }), false);
    assert.equal(isConfirmedLaunchdStopped({ code: 1, definitiveExit: true, timedOut: true }), false);
    assert.equal(isConfirmedLaunchdStopped({ code: 0, definitiveExit: true, timedOut: false }), false);
});

test('systemd rollback restarts a previous unit only after a definitive inactive state', () => {
    assert.equal(isConfirmedSystemdStopped({ stdout: 'ActiveState=inactive\n', code: 0, definitiveExit: true, timedOut: false }), true);
    assert.equal(isConfirmedSystemdStopped({ stdout: 'ActiveState=failed\n', code: 0, definitiveExit: true, timedOut: false }), true);
    assert.equal(isConfirmedSystemdStopped({ stdout: 'ActiveState=active\n', code: 0, definitiveExit: true, timedOut: false }), false);
    assert.equal(isConfirmedSystemdStopped({ stdout: '', code: 1, definitiveExit: true, timedOut: false }), true);
    assert.equal(isConfirmedSystemdStopped({ stdout: '', code: 1, definitiveExit: false, timedOut: false }), false);
    assert.equal(isConfirmedSystemdStopped({ stdout: '', code: 1, definitiveExit: true, timedOut: true }), false);
});
