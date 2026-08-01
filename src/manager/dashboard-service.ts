import { existsSync, writeFileSync, unlinkSync, mkdirSync, readFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { homedir } from 'node:os';
import { getNodePath, getJawPath, buildServicePath } from '../core/instance.js';
import { detectBackend } from './platform-service.js';

const LABEL_LAUNCHD = 'com.weasley.podex.dashboard';
const LABEL_SYSTEMD = 'weasley-podex-dashboard';
const LEGACY_LABEL_LAUNCHD = 'com.podex.dashboard';
const LEGACY_LABEL_SYSTEMD = 'jaw-dashboard';

function hasDefinitiveExitStatus(error: unknown): boolean {
    return typeof (error as { status?: unknown } | null)?.status === 'number';
}

function plistPath(label = LABEL_LAUNCHD): string {
    return join(homedir(), 'Library', 'LaunchAgents', `${label}.plist`);
}

function unitPath(label = LABEL_SYSTEMD): string {
    return join(homedir(), '.config', 'systemd', 'user', `${label}.service`);
}

function xmlUnescape(value: string): string {
    return value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

export function isManagedDashboardPlist(path: string, label: string): boolean {
    if (!existsSync(path)) return false;
    try {
        const content = readFileSync(path, 'utf8');
        const expectedHome = label === LABEL_LAUNCHD
            ? join(homedir(), '.weasley', 'podex')
            : label === LEGACY_LABEL_LAUNCHD
                ? join(homedir(), '.podex')
                : null;
        const labelMatch = content.match(/<key>Label<\/key>\s*<string>([^<]*)<\/string>/);
        const argsBlock = content.match(/<key>ProgramArguments<\/key>\s*<array>([\s\S]*?)<\/array>/)?.[1] ?? '';
        const args = [...argsBlock.matchAll(/<string>([\s\S]*?)<\/string>/g)]
            .map(match => xmlUnescape(match[1] ?? ''));
        const dashboardIndex = args.indexOf('dashboard');
        const envHomeMatch = content.match(/<key>(?:WEASLEY_PODEX_HOME|podex_HOME)<\/key>\s*<string>([^<]*)<\/string>/);
        const envHome = envHomeMatch ? xmlUnescape(envHomeMatch[1] ?? '') : undefined;
        const port = Number(args[dashboardIndex + 3]);
        const from = Number(args[dashboardIndex + 5]);
        const count = Number(args[dashboardIndex + 7]);
        const expectedArgs = dashboardIndex >= 0
            && args[dashboardIndex + 1] === 'serve'
            && args[dashboardIndex + 2] === '--port'
            && args[dashboardIndex + 4] === '--from'
            && args[dashboardIndex + 6] === '--count'
            && args[dashboardIndex + 8] === '--no-open';
        return expectedHome !== null
            && xmlUnescape(labelMatch?.[1] ?? '') === label
            && envHome === expectedHome
            && expectedArgs
            && Number.isInteger(port)
            && Number.isInteger(from)
            && Number.isInteger(count)
            && count > 0;
    } catch {
        return false;
    }
}

export function isManagedDashboardUnit(path: string, label: string): boolean {
    if (!existsSync(path)) return false;
    try {
        const content = readFileSync(path, 'utf8');
        const expectedHome = label === LABEL_SYSTEMD
            ? join(homedir(), '.weasley', 'podex')
            : label === LEGACY_LABEL_SYSTEMD
                ? join(homedir(), '.podex')
                : null;
        const execMatch = content.match(/^ExecStart=.*?\sdashboard\s+serve\s+--port\s+(\d+)\s+--from\s+(\d+)\s+--count\s+(\d+)\s+--no-open\s*$/m);
        const envMatch = content.match(/^Environment=(?:WEASLEY_PODEX_HOME|podex_HOME)=(?:"([^"]+)"|(\S+))\s*$/m);
        const workingMatch = content.match(/^WorkingDirectory=(?:"([^"]+)"|(\S+))\s*$/m);
        const envHome = envMatch?.[1] ?? envMatch?.[2];
        const workingHome = workingMatch?.[1] ?? workingMatch?.[2];
        return expectedHome !== null
            && basename(path, '.service') === label
            && envHome === expectedHome
            && workingHome === expectedHome
            && Number.isInteger(Number(execMatch?.[1]))
            && Number.isInteger(Number(execMatch?.[2]))
            && Number.isInteger(Number(execMatch?.[3]))
            && Number(execMatch?.[3]) > 0;
    } catch {
        return false;
    }
}

function registeredLaunchdTarget(): { label: string; path: string } | null {
    const path = plistPath();
    if (isManagedDashboardPlist(path, LABEL_LAUNCHD)) return { label: LABEL_LAUNCHD, path };
    const legacyPath = plistPath(LEGACY_LABEL_LAUNCHD);
    if (isManagedDashboardPlist(legacyPath, LEGACY_LABEL_LAUNCHD)) {
        return { label: LEGACY_LABEL_LAUNCHD, path: legacyPath };
    }
    return null;
}

function registeredSystemdTarget(): { label: string; path: string } | null {
    const path = unitPath();
    if (isManagedDashboardUnit(path, LABEL_SYSTEMD)) return { label: LABEL_SYSTEMD, path };
    const legacyPath = unitPath(LEGACY_LABEL_SYSTEMD);
    if (isManagedDashboardUnit(legacyPath, LEGACY_LABEL_SYSTEMD)) {
        return { label: LEGACY_LABEL_SYSTEMD, path: legacyPath };
    }
    return null;
}

function generateDashboardPlist(port: number, from: number, count: number): string {
    const nodePath = getNodePath();
    const jawPath = getJawPath();
    const jawHome = join(homedir(), '.weasley', 'podex');
    const logDir = join(jawHome, 'logs');
    const servicePath = buildServicePath(process.env["PATH"] || '', [join(homedir(), '.local', 'bin')]);
    mkdirSync(logDir, { recursive: true });

    const x = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${x(LABEL_LAUNCHD)}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${x(nodePath)}</string>
        <string>${x(jawPath)}</string>
        <string>dashboard</string>
        <string>serve</string>
        <string>--port</string>
        <string>${port}</string>
        <string>--from</string>
        <string>${from}</string>
        <string>--count</string>
        <string>${count}</string>
        <string>--no-open</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>LimitLoadToSessionType</key>
    <string>Aqua</string>
    <key>ProcessType</key>
    <string>Interactive</string>
    <key>WorkingDirectory</key>
    <string>${x(jawHome)}</string>
    <key>StandardOutPath</key>
    <string>${x(logDir)}/dashboard.log</string>
    <key>StandardErrorPath</key>
    <string>${x(logDir)}/dashboard.err</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>${x(servicePath)}</string>
        <key>WEASLEY_PODEX_HOME</key>
        <string>${x(jawHome)}</string>
        <key>WEASLEY_PODEX_RUNTIME</key>
        <string>launchd</string>
    </dict>
</dict>
</plist>`;
}

function generateDashboardUnit(port: number, from: number, count: number): string {
    const nodePath = getNodePath();
    const jawPath = getJawPath();
    const jawHome = join(homedir(), '.weasley', 'podex');
    const servicePath = buildServicePath(process.env["PATH"] || '', [join(homedir(), '.local', 'bin')]);
    const logDir = join(jawHome, 'logs');
    mkdirSync(logDir, { recursive: true });

    const q = (s: string) => s.includes(' ') ? `"${s}"` : s;
    return `[Unit]
Description=Weasley Podex Dashboard Server
After=network.target

[Service]
Type=simple
WorkingDirectory=${q(jawHome)}
ExecStart=${q(nodePath)} ${q(jawPath)} dashboard serve --port ${port} --from ${from} --count ${count} --no-open
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment="PATH=${servicePath}"
Environment=WEASLEY_PODEX_HOME=${q(jawHome)}
Environment=WEASLEY_PODEX_RUNTIME=systemd
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${LABEL_SYSTEMD}

[Install]
WantedBy=default.target`;
}

export async function permDashboard(port: number, from: number, count: number): Promise<void> {
    const backend = detectBackend();
    if (backend === 'none') {
        console.error('❌ No supported service backend (need macOS launchd or Linux systemd)');
        process.exitCode = 1;
        return;
    }

    if (backend === 'launchd') {
        const { execFileSync } = await import('node:child_process');
        const path = plistPath();
        const legacyPath = plistPath(LEGACY_LABEL_LAUNCHD);
        const previousPlist = existsSync(path) ? readFileSync(path, 'utf8') : null;
        if (previousPlist !== null && !isManagedDashboardPlist(path, LABEL_LAUNCHD)) {
            console.error(`❌ Refusing to replace an unmanaged plist: ${path}`);
            process.exitCode = 1;
            return;
        }
        const legacyRegistered = existsSync(legacyPath);
        if (legacyRegistered && !isManagedDashboardPlist(legacyPath, LEGACY_LABEL_LAUNCHD)) {
            console.error(`❌ Refusing to migrate an unmanaged legacy plist: ${legacyPath}`);
            process.exitCode = 1;
            return;
        }
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, generateDashboardPlist(port, from, count));
        const uid = typeof process.getuid === 'function' ? process.getuid() : 501;

        const restorePlistFile = (): void => {
            if (previousPlist !== null) writeFileSync(path, previousPlist);
            else try { unlinkSync(path); } catch { /* failed registration left no durable file */ }
        };
        const ensureStopped = (label: string): boolean => {
            try {
                execFileSync('/bin/launchctl', ['bootout', `gui/${uid}/${label}`], { stdio: 'pipe', timeout: 5000 });
            } catch { /* verify below: not-loaded is also reported as an error */ }
            try {
                execFileSync('/bin/launchctl', ['print', `gui/${uid}/${label}`], { stdio: 'pipe', timeout: 2000 });
                return false;
            } catch (error) {
                // A numeric launchctl exit means the label is absent. ENOENT and
                // timeout are ambiguous and therefore fail closed.
                return hasDefinitiveExitStatus(error);
            }
        };

        if (legacyRegistered) {
            if (!ensureStopped(LEGACY_LABEL_LAUNCHD)) {
                restorePlistFile();
                throw new Error(`Legacy dashboard service ${LEGACY_LABEL_LAUNCHD} could not be stopped safely`);
            }
        }
        if (!ensureStopped(LABEL_LAUNCHD)) {
            restorePlistFile();
            throw new Error(`Dashboard service ${LABEL_LAUNCHD} could not be stopped safely`);
        }
        try {
            execFileSync('/bin/launchctl', ['bootstrap', `gui/${uid}`, path], { stdio: 'pipe', timeout: 5000 });
        } catch (error) {
            // bootstrap may have succeeded before timing out. Restore exactly one
            // previous service only after the new label is confirmed absent.
            const rollbackStopped = ensureStopped(LABEL_LAUNCHD);
            restorePlistFile();
            if (rollbackStopped) {
                const restorePath = previousPlist !== null ? path : legacyRegistered ? legacyPath : null;
                if (restorePath) {
                    try {
                        execFileSync('/bin/launchctl', ['bootstrap', `gui/${uid}`, restorePath], { stdio: 'pipe', timeout: 5000 });
                    } catch { /* preserve the original activation error */ }
                }
            }
            throw error;
        }
        if (legacyRegistered) {
            try { unlinkSync(legacyPath); } catch { /* migration cleanup is best-effort */ }
        }
        console.log(`✅ Dashboard registered as ${LABEL_LAUNCHD}`);
        console.log(`   Plist: ${path}`);
    }

    if (backend === 'systemd') {
        const { execFileSync } = await import('node:child_process');
        const path = unitPath();
        const legacyPath = unitPath(LEGACY_LABEL_SYSTEMD);
        const previousUnit = existsSync(path) ? readFileSync(path, 'utf8') : null;
        if (previousUnit !== null && !isManagedDashboardUnit(path, LABEL_SYSTEMD)) {
            console.error(`❌ Refusing to replace an unmanaged unit: ${path}`);
            process.exitCode = 1;
            return;
        }
        const legacyRegistered = existsSync(legacyPath);
        if (legacyRegistered && !isManagedDashboardUnit(legacyPath, LEGACY_LABEL_SYSTEMD)) {
            console.error(`❌ Refusing to migrate an unmanaged legacy unit: ${legacyPath}`);
            process.exitCode = 1;
            return;
        }
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, generateDashboardUnit(port, from, count));

        const restoreUnitFile = (): void => {
            if (previousUnit !== null) writeFileSync(path, previousUnit);
            else try { unlinkSync(path); } catch { /* failed registration left no durable file */ }
        };
        const ensureStopped = (label: string): boolean => {
            try {
                execFileSync('systemctl', ['--user', 'disable', '--now', label], { stdio: 'pipe', timeout: 5000 });
            } catch { /* verify below: inactive units can still report an error */ }
            try {
                const output = execFileSync(
                    'systemctl',
                    ['--user', 'show', label, '--property=ActiveState'],
                    { stdio: 'pipe', timeout: 5000, encoding: 'utf8' },
                );
                const activeState = output.match(/ActiveState=(\w+)/)?.[1];
                return activeState === 'inactive' || activeState === 'failed';
            } catch (error) {
                return hasDefinitiveExitStatus(error);
            }
        };

        if (legacyRegistered) {
            if (!ensureStopped(LEGACY_LABEL_SYSTEMD)) {
                restoreUnitFile();
                throw new Error(`Legacy dashboard service ${LEGACY_LABEL_SYSTEMD} could not be stopped safely`);
            }
        }
        if (!ensureStopped(LABEL_SYSTEMD)) {
            restoreUnitFile();
            throw new Error(`Dashboard service ${LABEL_SYSTEMD} could not be stopped safely`);
        }
        try {
            execFileSync('systemctl', ['--user', 'daemon-reload'], { stdio: 'pipe', timeout: 5000 });
            execFileSync('systemctl', ['--user', 'enable', '--now', LABEL_SYSTEMD], { stdio: 'pipe', timeout: 5000 });
        } catch (error) {
            const rollbackStopped = ensureStopped(LABEL_SYSTEMD);
            restoreUnitFile();
            let reloaded = false;
            try {
                execFileSync('systemctl', ['--user', 'daemon-reload'], { stdio: 'pipe', timeout: 5000 });
                reloaded = true;
            } catch { /* preserve the original activation error */ }
            if (rollbackStopped && reloaded) {
                const restoreLabel = previousUnit !== null ? LABEL_SYSTEMD : legacyRegistered ? LEGACY_LABEL_SYSTEMD : null;
                if (restoreLabel) {
                    try {
                        execFileSync('systemctl', ['--user', 'enable', '--now', restoreLabel], { stdio: 'pipe', timeout: 5000 });
                    } catch { /* preserve the original activation error */ }
                }
            }
            throw error;
        }
        if (legacyRegistered) {
            try { unlinkSync(legacyPath); } catch { /* migration cleanup is best-effort */ }
            execFileSync('systemctl', ['--user', 'daemon-reload'], { stdio: 'pipe' });
        }
        console.log(`✅ Dashboard registered as ${LABEL_SYSTEMD}`);
        console.log(`   Unit: ${path}`);
    }
}

export async function unpermDashboard(jsonOut = false): Promise<void> {
    const backend = detectBackend();
    if (backend === 'launchd') {
        const { execFileSync } = await import('node:child_process');
        const uid = typeof process.getuid === 'function' ? process.getuid() : 501;
        const candidates = [
            { label: LABEL_LAUNCHD, path: plistPath() },
            { label: LEGACY_LABEL_LAUNCHD, path: plistPath(LEGACY_LABEL_LAUNCHD) },
        ].filter(candidate => existsSync(candidate.path));
        if (candidates.some(candidate => !isManagedDashboardPlist(candidate.path, candidate.label))) {
            console.error('❌ Refusing to remove an unmanaged dashboard plist');
            process.exitCode = 1;
            return;
        }
        for (const candidate of candidates) {
            try { execFileSync('/bin/launchctl', ['bootout', `gui/${uid}/${candidate.label}`], { stdio: 'pipe' }); } catch {} // best-effort: service may not be loaded
            try { unlinkSync(candidate.path); } catch { /* already gone */ }
        }
        if (jsonOut) console.log(JSON.stringify({ ok: true, action: 'unset', backend }));
        else console.log(`✅ Dashboard service removed (${candidates.map(candidate => candidate.label).join(', ') || LABEL_LAUNCHD})`);
        return;
    }
    if (backend === 'systemd') {
        const { execFileSync } = await import('node:child_process');
        const candidates = [
            { label: LABEL_SYSTEMD, path: unitPath() },
            { label: LEGACY_LABEL_SYSTEMD, path: unitPath(LEGACY_LABEL_SYSTEMD) },
        ].filter(candidate => existsSync(candidate.path));
        if (candidates.some(candidate => !isManagedDashboardUnit(candidate.path, candidate.label))) {
            console.error('❌ Refusing to remove an unmanaged dashboard unit');
            process.exitCode = 1;
            return;
        }
        for (const candidate of candidates) {
            try { execFileSync('systemctl', ['--user', 'disable', '--now', candidate.label], { stdio: 'pipe' }); } catch {} // best-effort: service may not be loaded
            try { unlinkSync(candidate.path); } catch { /* already gone */ }
        }
        execFileSync('systemctl', ['--user', 'daemon-reload'], { stdio: 'pipe' });
        if (jsonOut) console.log(JSON.stringify({ ok: true, action: 'unset', backend }));
        else console.log(`✅ Dashboard service removed (${candidates.map(candidate => candidate.label).join(', ') || LABEL_SYSTEMD})`);
        return;
    }
    console.error('❌ No supported service backend');
    process.exitCode = 1;
}

export async function dashboardServiceStatus(jsonOut = false): Promise<void> {
    const backend = detectBackend();
    if (backend === 'launchd') {
        const target = registeredLaunchdTarget();
        const label = target?.label ?? LABEL_LAUNCHD;
        const registered = target !== null;
        let loaded = false;
        let pid: number | null = null;
        if (registered) {
            const { execFileSync } = await import('node:child_process');
            const uid = typeof process.getuid === 'function' ? process.getuid() : 501;
            try {
                const out = execFileSync('/bin/launchctl', ['print', `gui/${uid}/${label}`], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
                loaded = true;
                const m = out.match(/pid\s*=\s*(\d+)/);
                if (m) pid = Number(m[1]);
            } catch {} // best-effort: launchctl print fails when not loaded
        }
        if (jsonOut) {
            console.log(JSON.stringify({ backend, label, registered, loaded, pid }));
        } else {
            console.log(`  Backend: launchd`);
            console.log(`  Label: ${label}`);
            console.log(`  Registered: ${registered ? 'yes' : 'no'}`);
            console.log(`  Running: ${loaded ? `yes (pid ${pid})` : 'no'}`);
        }
        return;
    }
    if (backend === 'systemd') {
        const target = registeredSystemdTarget();
        const label = target?.label ?? LABEL_SYSTEMD;
        const registered = target !== null;
        let active = false;
        let pid: number | null = null;
        if (registered) {
            const { execFileSync } = await import('node:child_process');
            try {
                const out = execFileSync('systemctl', ['--user', 'show', label, '--property=ActiveState,MainPID'], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
                active = out.includes('ActiveState=active');
                const m = out.match(/MainPID=(\d+)/);
                if (m && Number(m[1]) > 0) pid = Number(m[1]);
            } catch {} // best-effort: systemctl show fails when unit missing
        }
        if (jsonOut) {
            console.log(JSON.stringify({ backend, label, registered, active, pid }));
        } else {
            console.log(`  Backend: systemd`);
            console.log(`  Unit: ${label}`);
            console.log(`  Registered: ${registered ? 'yes' : 'no'}`);
            console.log(`  Running: ${active ? `yes (pid ${pid})` : 'no'}`);
        }
        return;
    }
    if (jsonOut) console.log(JSON.stringify({ backend: 'none', registered: false }));
    else console.error('  No supported service backend');
}

