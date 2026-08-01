import { execFile, execFileSync } from 'node:child_process';
import { existsSync, writeFileSync, unlinkSync, mkdirSync, readFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { getNodePath, getJawPath, buildServicePath } from '../core/instance.js';
import { MANAGED_INSTANCE_PORT_FROM, MANAGED_INSTANCE_PORT_TO } from './constants.js';
import type { DashboardServiceState, DashboardLifecycleResult } from './types.js';

const SYSTEMCTL = 'systemctl';
const OP_TIMEOUT_MS = 5000;
const SYSTEMD_UNIT_PREFIX = 'weasley-podex-';
const LEGACY_SYSTEMD_UNIT_PREFIX = 'jaw-';

export function isSystemdSupported(): boolean {
    if (process.platform !== 'linux') return false;
    try {
        execFileSync('which', ['systemctl'], { stdio: 'pipe' });
        return true;
    } catch { return false; }
}

function instanceIdForHome(home: string): string {
    const base = basename(home);
    if (base === '.podex' || (base === 'podex' && basename(dirname(home)) === '.weasley')) return 'default';
    const hash = createHash('md5').update(home).digest('hex').slice(0, 8);
    return `${base.replace(/^\./, '')}-${hash}`;
}

function sanitize(name: string): string {
    return name.replace(/[^a-zA-Z0-9:._-]/g, '-');
}

export function computeUnitName(_port: number, home: string): string {
    const id = sanitize(instanceIdForHome(home));
    return `${SYSTEMD_UNIT_PREFIX}${id}`;
}

function legacyHomeForPort(port: number, home: string): string {
    const parent = dirname(home);
    if (basename(parent) !== '.weasley') return home;
    const root = dirname(parent);
    if (basename(home) === 'podex') return join(root, '.podex');
    if (basename(home) === `podex-${port}`) return join(root, `.podex-${port}`);
    return home;
}

export function computeLegacyUnitName(port: number, home: string): string {
    const id = sanitize(instanceIdForHome(legacyHomeForPort(port, home)));
    return `${LEGACY_SYSTEMD_UNIT_PREFIX}${id}`;
}

function userUnitDir(): string {
    return join(homedir(), '.config', 'systemd', 'user');
}

export function computeUnitPath(unitName: string): string {
    return join(userUnitDir(), `${unitName}.service`);
}

export function isManagedSystemdUnit(
    unitPath: string,
    expectedUnitName?: string,
    expectedPort?: number,
    expectedHome?: string,
): boolean {
    if (!existsSync(unitPath)) return false;
    try {
        const content = readFileSync(unitPath, 'utf8');
        const execMatch = content.match(/^ExecStart=.*?\s--home\s+(?:"([^"]+)"|(\S+))\s+serve\s+--port\s+(\d+)\s+--no-open\s*$/m);
        const envMatch = content.match(/^Environment=(?:WEASLEY_PODEX_HOME|podex_HOME)=(?:"([^"]+)"|(\S+))\s*$/m);
        const home = execMatch?.[1] ?? execMatch?.[2];
        const envHome = envMatch?.[1] ?? envMatch?.[2];
        const port = Number(execMatch?.[3]);
        const unitName = basename(unitPath, '.service');
        if (!home || home !== envHome || !Number.isInteger(port)) return false;
        if (!content.includes(`Server (${unitName})`)) return false;
        if (expectedUnitName !== undefined && unitName !== expectedUnitName) return false;
        if (expectedPort !== undefined && port !== expectedPort) return false;
        if (expectedHome !== undefined && home !== expectedHome) return false;

        const derivedUnitName = unitName.startsWith(SYSTEMD_UNIT_PREFIX)
            ? computeUnitName(port, home)
            : /^jaw-[a-zA-Z0-9][a-zA-Z0-9:._-]*$/.test(unitName)
                ? computeLegacyUnitName(port, home)
                : '';
        return derivedUnitName === unitName;
    } catch {
        return false;
    }
}

function registeredTarget(port: number, home: string): { unitName: string; unitPath: string } | null {
    const unitName = computeUnitName(port, home);
    const unitPath = computeUnitPath(unitName);
    if (isManagedSystemdUnit(unitPath, unitName, port, home)) return { unitName, unitPath };

    const legacyUnitName = computeLegacyUnitName(port, home);
    const legacyUnitPath = computeUnitPath(legacyUnitName);
    const legacyHome = legacyHomeForPort(port, home);
    if (isManagedSystemdUnit(legacyUnitPath, legacyUnitName, port, legacyHome)) {
        return { unitName: legacyUnitName, unitPath: legacyUnitPath };
    }
    return null;
}

type CommandResult = { stdout: string; stderr: string; code: number; timedOut: boolean; definitiveExit: boolean };

export function isConfirmedSystemdStopped(
    result: { stdout: string; code: number; timedOut: boolean; definitiveExit: boolean },
): boolean {
    if (result.timedOut) return false;
    if (result.code !== 0) return result.definitiveExit;
    const activeState = result.stdout.match(/ActiveState=(\w+)/)?.[1];
    return activeState === 'inactive' || activeState === 'failed';
}

function execSystemctl(args: string[], timeoutMs: number): Promise<CommandResult> {
    return new Promise((resolve) => {
        const child = execFile(SYSTEMCTL, ['--user', ...args], { timeout: timeoutMs, encoding: 'utf8' }, (err, stdout, stderr) => {
            const rawCode = err && 'code' in err ? (err as { code?: string | number | null }).code : undefined;
            const code = typeof rawCode === 'number' ? rawCode : err ? 1 : 0;
            const timedOut = Boolean(err && 'killed' in err && (err as NodeJS.ErrnoException & { killed?: boolean }).killed);
            const definitiveExit = !err || typeof rawCode === 'number';
            resolve({ stdout: stdout || '', stderr: stderr || '', code, timedOut, definitiveExit });
        });
        child.unref?.();
    });
}

async function ensureSystemdStopped(unitName: string): Promise<{ ok: boolean; detail: string }> {
    const stop = await execSystemctl(['disable', '--now', unitName], OP_TIMEOUT_MS);
    const state = await execSystemctl(['show', unitName, '--property=ActiveState'], OP_TIMEOUT_MS);
    const ok = isConfirmedSystemdStopped(state);
    return { ok, detail: stop.stderr.trim() || state.stderr.trim() };
}

function generateUnit(port: number, home: string): string {
    const nodePath = getNodePath();
    const jawPath = getJawPath();
    const servicePath = buildServicePath(process.env["PATH"] || '', [dirname(nodePath), dirname(jawPath)]);
    const logDir = join(home, 'logs');
    mkdirSync(logDir, { recursive: true });

    const q = (s: string) => s.includes(' ') ? `"${s}"` : s;
    const unitName = computeUnitName(port, home);

    return `[Unit]
Description=Weasley Podex Server (${unitName})
After=network.target

[Service]
Type=simple
WorkingDirectory=${q(home)}
ExecStart=${q(nodePath)} ${q(jawPath)} --home ${q(home)} serve --port ${port} --no-open
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment="PATH=${servicePath}"
Environment=WEASLEY_PODEX_HOME=${q(home)}
Environment=WEASLEY_PODEX_RUNTIME=systemd
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${unitName}

[Install]
WantedBy=default.target`;
}

export async function detectSystemdState(port: number, home: string): Promise<DashboardServiceState> {
    const currentUnitName = computeUnitName(port, home);
    const target = registeredTarget(port, home);
    const unitName = target?.unitName ?? currentUnitName;
    const unitPath = target?.unitPath ?? computeUnitPath(currentUnitName);
    const registered = target !== null;

    if (!registered) {
        return { registered: false, loaded: false, pid: null, label: unitName, unitPath, backend: 'systemd' };
    }

    const { stdout, code } = await execSystemctl(['show', unitName, '--property=ActiveState,MainPID'], OP_TIMEOUT_MS);
    if (code !== 0) {
        return { registered: true, loaded: false, pid: null, label: unitName, unitPath, backend: 'systemd' };
    }

    const activeMatch = stdout.match(/ActiveState=(\w+)/);
    const pidMatch = stdout.match(/MainPID=(\d+)/);
    const loaded = activeMatch?.[1] === 'active';
    const pid = pidMatch ? Number(pidMatch[1]) : null;
    return { registered: true, loaded, pid: pid && pid > 0 ? pid : null, label: unitName, unitPath, backend: 'systemd' };
}

export async function detectAllSystemdStates(
    portRange: { from: number; to: number },
    homeRoot = homedir(),
): Promise<Map<number, DashboardServiceState>> {
    const results = new Map<number, DashboardServiceState>();
    if (!isSystemdSupported()) return results;

    const promises: Promise<void>[] = [];
    for (let port = portRange.from; port <= portRange.to; port++) {
        const home = port === MANAGED_INSTANCE_PORT_FROM
            ? join(homeRoot, '.weasley', 'podex')
            : join(homeRoot, '.weasley', `podex-${port}`);
        if (!registeredTarget(port, home)) continue;
        const p = port;
        promises.push(
            detectSystemdState(p, home).then((state) => { results.set(p, state); }),
        );
    }
    await Promise.all(promises);
    return results;
}

function validatePort(port: number): boolean {
    return Number.isInteger(port) && port >= MANAGED_INSTANCE_PORT_FROM && port <= MANAGED_INSTANCE_PORT_TO;
}

function validateUnitName(name: string): boolean {
    return name.startsWith(SYSTEMD_UNIT_PREFIX)
        && /^[a-zA-Z0-9][a-zA-Z0-9:._-]*$/.test(name.slice(SYSTEMD_UNIT_PREFIX.length));
}

function validateOperableUnitName(name: string): boolean {
    const hasKnownFormat = validateUnitName(name)
        || /^jaw-[a-zA-Z0-9][a-zA-Z0-9:._-]*$/.test(name);
    return hasKnownFormat && isManagedSystemdUnit(computeUnitPath(name), name);
}

export async function permInstance(port: number, home: string): Promise<DashboardLifecycleResult> {
    if (!isSystemdSupported()) {
        return { ok: false, action: 'perm', port, status: 'rejected', message: 'systemd not available', home, pid: null, command: [] };
    }
    if (!validatePort(port)) {
        return { ok: false, action: 'perm', port, status: 'rejected', message: 'port out of managed range', home, pid: null, command: [] };
    }

    const unitName = computeUnitName(port, home);
    if (!validateUnitName(unitName)) {
        return { ok: false, action: 'perm', port, status: 'rejected', message: 'invalid unit name', home, pid: null, command: [] };
    }

    const unitPath = computeUnitPath(unitName);
    const previousUnit = existsSync(unitPath) ? readFileSync(unitPath, 'utf8') : null;
    if (previousUnit !== null && !isManagedSystemdUnit(unitPath, unitName, port, home)) {
        return { ok: false, action: 'perm', port, status: 'rejected', message: 'unit file is not managed by Weasley Podex', home, pid: null, command: [] };
    }

    const legacyUnitName = computeLegacyUnitName(port, home);
    const legacyUnitPath = computeUnitPath(legacyUnitName);
    const legacyHome = legacyHomeForPort(port, home);
    const legacyRegistered = existsSync(legacyUnitPath);
    if (legacyRegistered && !isManagedSystemdUnit(legacyUnitPath, legacyUnitName, port, legacyHome)) {
        return { ok: false, action: 'perm', port, status: 'rejected', message: 'legacy unit file is not managed by Weasley Podex', home, pid: null, command: [] };
    }
    mkdirSync(userUnitDir(), { recursive: true });

    const unit = generateUnit(port, home);
    writeFileSync(unitPath, unit);

    const restoreUnitFile = (): void => {
        if (previousUnit !== null) writeFileSync(unitPath, previousUnit);
        else try { unlinkSync(unitPath); } catch { /* failed registration left no durable file */ }
    };

    if (legacyRegistered) {
        const legacyStop = await ensureSystemdStopped(legacyUnitName);
        if (!legacyStop.ok) {
            restoreUnitFile();
            return {
                ok: false, action: 'perm', port, status: 'error',
                message: `legacy service could not be stopped safely${legacyStop.detail ? `: ${legacyStop.detail}` : ''}`,
                home, pid: null, command: ['systemctl', '--user', 'disable', '--now', legacyUnitName],
            };
        }
    }

    const currentStop = await ensureSystemdStopped(unitName);
    if (!currentStop.ok) {
        restoreUnitFile();
        return {
            ok: false, action: 'perm', port, status: 'error',
            message: `current service could not be stopped safely${currentStop.detail ? `: ${currentStop.detail}` : ''}`,
            home, pid: null, command: ['systemctl', '--user', 'disable', '--now', unitName],
        };
    }

    const rollbackActivation = async (failure: string): Promise<DashboardLifecycleResult> => {
        // enable --now can time out after starting the process. Never restart a
        // previous label until the new unit is confirmed inactive.
        const rollbackStop = await ensureSystemdStopped(unitName);
        restoreUnitFile();
        const reload = await execSystemctl(['daemon-reload'], OP_TIMEOUT_MS);
        let restoreError = '';
        if (!rollbackStop.ok) {
            restoreError = 'new service state could not be confirmed stopped; previous service was not restarted';
        } else if (reload.code !== 0 || reload.timedOut) {
            restoreError = reload.stderr.trim() || 'daemon-reload failed while restoring the previous service';
        } else {
            const restore = previousUnit !== null
                ? await execSystemctl(['enable', '--now', unitName], OP_TIMEOUT_MS)
                : legacyRegistered
                    ? await execSystemctl(['enable', '--now', legacyUnitName], OP_TIMEOUT_MS)
                    : null;
            if (restore && (restore.code !== 0 || restore.timedOut)) {
                restoreError = restore.stderr.trim() || 'previous service enable failed';
            }
        }
        return {
            ok: false, action: 'perm', port, status: 'error',
            message: `${failure}${restoreError ? `; rollback: ${restoreError}` : ''}`,
            home, pid: null, command: ['systemctl', '--user', 'enable', '--now', unitName],
        };
    };

    const reload = await execSystemctl(['daemon-reload'], OP_TIMEOUT_MS);
    if (reload.code !== 0 || reload.timedOut) {
        return rollbackActivation(`daemon-reload failed: ${reload.stderr.trim()}`);
    }

    const { stderr, code } = await execSystemctl(['enable', '--now', unitName], OP_TIMEOUT_MS);
    if (code !== 0) {
        return rollbackActivation(`enable failed: ${stderr.trim()}`);
    }

    if (legacyRegistered) {
        try { unlinkSync(legacyUnitPath); } catch { /* migration cleanup is best-effort */ }
        await execSystemctl(['daemon-reload'], OP_TIMEOUT_MS);
    }

    const state = await detectSystemdState(port, home);
    return {
        ok: true, action: 'perm', port, status: 'permed',
        message: `registered as ${unitName}`,
        home, pid: state.pid, command: ['systemctl', '--user', 'enable', '--now', unitName],
        expectedStateAfter: 'online',
    };
}

export async function unpermInstance(port: number, home: string): Promise<DashboardLifecycleResult> {
    if (!isSystemdSupported()) {
        return { ok: false, action: 'unperm', port, status: 'rejected', message: 'systemd not available', home, pid: null, command: [] };
    }

    const unitName = computeUnitName(port, home);
    if (!validateUnitName(unitName)) {
        return { ok: false, action: 'unperm', port, status: 'rejected', message: 'invalid unit name', home, pid: null, command: [] };
    }

    const legacyUnitName = computeLegacyUnitName(port, home);
    const legacyHome = legacyHomeForPort(port, home);
    const candidates = [
        { unitName, unitPath: computeUnitPath(unitName), expectedHome: home },
        { unitName: legacyUnitName, unitPath: computeUnitPath(legacyUnitName), expectedHome: legacyHome },
    ].filter(candidate => existsSync(candidate.unitPath));

    if (candidates.length === 0) {
        return { ok: false, action: 'unperm', port, status: 'rejected', message: 'no unit registered', home, pid: null, command: [] };
    }

    for (const candidate of candidates) {
        if (!isManagedSystemdUnit(candidate.unitPath, candidate.unitName, port, candidate.expectedHome)) {
            return { ok: false, action: 'unperm', port, status: 'rejected', message: 'unit file is not managed by Weasley Podex', home, pid: null, command: [] };
        }
    }

    for (const candidate of candidates) {
        await execSystemctl(['disable', '--now', candidate.unitName], OP_TIMEOUT_MS);
        try { unlinkSync(candidate.unitPath); } catch { /* already gone */ }
    }
    await execSystemctl(['daemon-reload'], OP_TIMEOUT_MS);

    const removedUnits = candidates.map(candidate => candidate.unitName).join(', ');

    return {
        ok: true, action: 'unperm', port, status: 'unpermed',
        message: `removed ${removedUnits}`,
        home, pid: null, command: ['systemctl', '--user', 'disable', '--now', candidates[0]!.unitName],
        expectedStateAfter: 'offline',
    };
}

export async function stopSystemdInstance(unitName: string): Promise<DashboardLifecycleResult> {
    if (!validateOperableUnitName(unitName)) {
        return { ok: false, action: 'stop', port: 0, status: 'rejected', message: 'invalid unit name', home: null, pid: null, command: [] };
    }
    const { code, stderr } = await execSystemctl(['stop', unitName], OP_TIMEOUT_MS);
    if (code !== 0) {
        return { ok: false, action: 'stop', port: 0, status: 'error', message: `stop failed: ${stderr.trim()}`, home: null, pid: null, command: ['systemctl', '--user', 'stop'] };
    }
    return { ok: true, action: 'stop', port: 0, status: 'stopped', message: 'systemd service stopped (unit kept)', home: null, pid: null, command: ['systemctl', '--user', 'stop'] };
}

export async function startSystemdInstance(unitName: string): Promise<DashboardLifecycleResult> {
    if (!validateOperableUnitName(unitName)) {
        return { ok: false, action: 'start', port: 0, status: 'rejected', message: 'invalid unit name', home: null, pid: null, command: [] };
    }
    const { code, stderr } = await execSystemctl(['start', unitName], OP_TIMEOUT_MS);
    if (code !== 0) {
        return { ok: false, action: 'start', port: 0, status: 'error', message: `start failed: ${stderr.trim()}`, home: null, pid: null, command: ['systemctl', '--user', 'start'] };
    }
    return { ok: true, action: 'start', port: 0, status: 'started', message: 'systemd service started', home: null, pid: null, command: ['systemctl', '--user', 'start'] };
}

export async function restartSystemdInstance(unitName: string): Promise<DashboardLifecycleResult> {
    if (!validateOperableUnitName(unitName)) {
        return { ok: false, action: 'restart', port: 0, status: 'rejected', message: 'invalid unit name', home: null, pid: null, command: [] };
    }
    const { code, stderr } = await execSystemctl(['restart', unitName], OP_TIMEOUT_MS);
    if (code !== 0) {
        return { ok: false, action: 'restart', port: 0, status: 'error', message: `restart failed: ${stderr.trim()}`, home: null, pid: null, command: ['systemctl', '--user', 'restart'] };
    }
    return { ok: true, action: 'restart', port: 0, status: 'restarted', message: 'systemd service restarted', home: null, pid: null, command: ['systemctl', '--user', 'restart'] };
}

