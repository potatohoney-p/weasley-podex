import { execFile } from 'node:child_process';
import { existsSync, writeFileSync, unlinkSync, readFileSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { generateLaunchdPlist } from '../core/launchd-plist.js';
import { getNodePath, getJawPath, buildServicePath } from '../core/instance.js';
import { MANAGED_INSTANCE_PORT_FROM, MANAGED_INSTANCE_PORT_TO } from './constants.js';
import type { DashboardServiceState, DashboardLifecycleResult } from './types.js';

const LAUNCHCTL = '/bin/launchctl';
const PRINT_TIMEOUT_MS = 2000;
const OP_TIMEOUT_MS = 5000;
const LAUNCHD_LABEL_PREFIX = 'com.weasley.podex.';
const LEGACY_LAUNCHD_LABEL_PREFIX = 'com.podex.';

function uid(): number {
    return typeof process.getuid === 'function' ? process.getuid() : Number(process.env["UID"] || 501);
}

function guiDomain(): string {
    return `gui/${uid()}`;
}

export function isLaunchdSupported(): boolean {
    return process.platform === 'darwin';
}

export function instanceIdForHome(home: string): string {
    const base = basename(home);
    if (base === '.podex' || (base === 'podex' && basename(dirname(home)) === '.weasley')) return 'default';
    const hash = createHash('md5').update(home).digest('hex').slice(0, 8);
    return `${base.replace(/^\./, '')}-${hash}`;
}

export function computeLaunchdLabel(_port: number, home: string): string {
    const id = instanceIdForHome(home);
    return `${LAUNCHD_LABEL_PREFIX}${id}`;
}

function legacyHomeForPort(port: number, home: string): string {
    const parent = dirname(home);
    if (basename(parent) !== '.weasley') return home;
    const root = dirname(parent);
    if (basename(home) === 'podex') return join(root, '.podex');
    if (basename(home) === `podex-${port}`) return join(root, `.podex-${port}`);
    return home;
}

export function computeLegacyLaunchdLabel(port: number, home: string): string {
    const id = instanceIdForHome(legacyHomeForPort(port, home));
    return `${LEGACY_LAUNCHD_LABEL_PREFIX}${id}`;
}

export function computePlistPath(label: string): string {
    return join(homedir(), 'Library', 'LaunchAgents', `${label}.plist`);
}

function xmlUnescape(value: string): string {
    return value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

export function isManagedLaunchdPlist(
    plistPath: string,
    label: string,
    expectedPort?: number,
    expectedHome?: string,
): boolean {
    if (!existsSync(plistPath)) return false;
    try {
        const content = readFileSync(plistPath, 'utf8');
        const labelMatch = content.match(/<key>Label<\/key>\s*<string>([^<]*)<\/string>/);
        const argsBlock = content.match(/<key>ProgramArguments<\/key>\s*<array>([\s\S]*?)<\/array>/)?.[1] ?? '';
        const args = [...argsBlock.matchAll(/<string>([\s\S]*?)<\/string>/g)]
            .map(match => xmlUnescape(match[1] ?? ''));
        const homeIndex = args.indexOf('--home');
        const serveIndex = args.indexOf('serve');
        const portIndex = args.indexOf('--port');
        const home = homeIndex >= 0 ? args[homeIndex + 1] : undefined;
        const portText = portIndex >= 0 ? args[portIndex + 1] : undefined;
        const port = Number(portText);
        const envHomeMatch = content.match(/<key>(?:WEASLEY_PODEX_HOME|podex_HOME)<\/key>\s*<string>([^<]*)<\/string>/);
        const envHome = envHomeMatch ? xmlUnescape(envHomeMatch[1] ?? '') : undefined;
        if (xmlUnescape(labelMatch?.[1] ?? '') !== label) return false;
        const expectedArgs = homeIndex >= 0
            && args[homeIndex + 2] === 'serve'
            && args[homeIndex + 3] === '--port'
            && portIndex === homeIndex + 3
            && serveIndex === homeIndex + 2;
        if (!home || !Number.isInteger(port) || !expectedArgs || envHome !== home) return false;
        if (expectedPort !== undefined && port !== expectedPort) return false;
        if (expectedHome !== undefined && home !== expectedHome) return false;

        const derivedLabel = label.startsWith(LAUNCHD_LABEL_PREFIX)
            ? computeLaunchdLabel(port, home)
            : /^com\.podex\.[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(label)
                ? computeLegacyLaunchdLabel(port, home)
                : '';
        return derivedLabel === label;
    } catch {
        return false;
    }
}

function registeredTarget(port: number, home: string): { label: string; plistPath: string } | null {
    const label = computeLaunchdLabel(port, home);
    const plistPath = computePlistPath(label);
    if (isManagedLaunchdPlist(plistPath, label, port, home)) return { label, plistPath };

    const legacyLabel = computeLegacyLaunchdLabel(port, home);
    const legacyPlistPath = computePlistPath(legacyLabel);
    const legacyHome = legacyHomeForPort(port, home);
    if (isManagedLaunchdPlist(legacyPlistPath, legacyLabel, port, legacyHome)) {
        return { label: legacyLabel, plistPath: legacyPlistPath };
    }
    return null;
}

type CommandResult = { stdout: string; stderr: string; code: number; timedOut: boolean; definitiveExit: boolean };

export function isConfirmedLaunchdStopped(
    result: { code: number; timedOut: boolean; definitiveExit: boolean },
): boolean {
    return result.code !== 0 && result.definitiveExit && !result.timedOut;
}

function execLaunchctl(args: string[], timeoutMs: number): Promise<CommandResult> {
    return new Promise((resolve) => {
        const child = execFile(LAUNCHCTL, args, { timeout: timeoutMs, encoding: 'utf8' }, (err, stdout, stderr) => {
            const rawCode = err && 'code' in err ? (err as { code?: string | number | null }).code : undefined;
            const code = typeof rawCode === 'number' ? rawCode : err ? 1 : 0;
            const timedOut = Boolean(err && 'killed' in err && (err as NodeJS.ErrnoException & { killed?: boolean }).killed);
            const definitiveExit = !err || typeof rawCode === 'number';
            resolve({ stdout: stdout || '', stderr: stderr || '', code, timedOut, definitiveExit });
        });
        child.unref?.();
    });
}

async function ensureLaunchdStopped(label: string): Promise<{ ok: boolean; detail: string }> {
    const stop = await execLaunchctl(['bootout', `${guiDomain()}/${label}`], OP_TIMEOUT_MS);
    const state = await execLaunchctl(['print', `${guiDomain()}/${label}`], PRINT_TIMEOUT_MS);
    const ok = isConfirmedLaunchdStopped(state);
    return { ok, detail: stop.stderr.trim() || state.stderr.trim() };
}

export async function detectLaunchdState(port: number, home: string): Promise<DashboardServiceState> {
    const currentLabel = computeLaunchdLabel(port, home);
    const target = registeredTarget(port, home);
    const label = target?.label ?? currentLabel;
    const plistPath = target?.plistPath ?? computePlistPath(currentLabel);
    const registered = target !== null;

    if (!registered) {
        return { registered: false, loaded: false, pid: null, label, unitPath: plistPath, backend: 'launchd' };
    }

    const { stdout, code } = await execLaunchctl(['print', `${guiDomain()}/${label}`], PRINT_TIMEOUT_MS);
    if (code !== 0) {
        return { registered: true, loaded: false, pid: null, label, unitPath: plistPath, backend: 'launchd' };
    }

    const pidMatch = stdout.match(/pid\s*=\s*(\d+)/);
    const pid = pidMatch ? Number(pidMatch[1]) : null;
    return { registered: true, loaded: true, pid, label, unitPath: plistPath, backend: 'launchd' };
}

export async function detectAllLaunchdStates(
    portRange: { from: number; to: number },
    homeRoot = homedir(),
): Promise<Map<number, DashboardServiceState>> {
    const results = new Map<number, DashboardServiceState>();
    if (!isLaunchdSupported()) return results;

    const agentsDir = join(homedir(), 'Library', 'LaunchAgents');
    if (!existsSync(agentsDir)) return results;

    const promises: Promise<void>[] = [];
    for (let port = portRange.from; port <= portRange.to; port++) {
        const home = port === MANAGED_INSTANCE_PORT_FROM
            ? join(homeRoot, '.weasley', 'podex')
            : join(homeRoot, '.weasley', `podex-${port}`);
        if (!registeredTarget(port, home)) continue;
        const p = port;
        promises.push(
            detectLaunchdState(p, home).then((state) => { results.set(p, state); }),
        );
    }
    await Promise.all(promises);
    return results;
}

function validatePort(port: number): boolean {
    return Number.isInteger(port) && port >= MANAGED_INSTANCE_PORT_FROM && port <= MANAGED_INSTANCE_PORT_TO;
}

function validateLabel(label: string): boolean {
    return label.startsWith(LAUNCHD_LABEL_PREFIX)
        && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(label.slice(LAUNCHD_LABEL_PREFIX.length));
}

function validateOperableLabel(label: string, plistPath = computePlistPath(label)): boolean {
    const hasKnownFormat = validateLabel(label)
        || /^com\.podex\.[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(label);
    return hasKnownFormat
        && plistPath === computePlistPath(label)
        && isManagedLaunchdPlist(plistPath, label);
}

export async function permInstance(port: number, home: string): Promise<DashboardLifecycleResult> {
    if (!isLaunchdSupported()) {
        return { ok: false, action: 'perm', port, status: 'rejected', message: 'macOS only', home, pid: null, command: [] };
    }
    if (!validatePort(port)) {
        return { ok: false, action: 'perm', port, status: 'rejected', message: 'port out of managed range', home, pid: null, command: [] };
    }

    const label = computeLaunchdLabel(port, home);
    if (!validateLabel(label)) {
        return { ok: false, action: 'perm', port, status: 'rejected', message: 'invalid label', home, pid: null, command: [] };
    }

    const plistPath = computePlistPath(label);
    const previousPlist = existsSync(plistPath) ? readFileSync(plistPath, 'utf8') : null;
    if (previousPlist !== null && !isManagedLaunchdPlist(plistPath, label, port, home)) {
        return { ok: false, action: 'perm', port, status: 'rejected', message: 'plist label mismatch', home, pid: null, command: [] };
    }

    const legacyLabel = computeLegacyLaunchdLabel(port, home);
    const legacyPlistPath = computePlistPath(legacyLabel);
    const legacyHome = legacyHomeForPort(port, home);
    const legacyRegistered = existsSync(legacyPlistPath);
    if (legacyRegistered && !isManagedLaunchdPlist(legacyPlistPath, legacyLabel, port, legacyHome)) {
        return { ok: false, action: 'perm', port, status: 'rejected', message: 'legacy plist label mismatch', home, pid: null, command: [] };
    }
    const logDir = join(home, 'logs');
    await mkdir(logDir, { recursive: true });

    const nodePath = getNodePath();
    const jawPath = getJawPath();
    const servicePath = buildServicePath(process.env["PATH"] || '', [join(homedir(), '.local', 'bin')]);

    const plist = generateLaunchdPlist({
        label,
        port: String(port),
        nodePath,
        jawPath,
        jawHome: home,
        logDir,
        servicePath,
    });
    writeFileSync(plistPath, plist);

    // Stop only the exact legacy service derived from this home before binding
    // the same port under the Weasley label. Keep its plist for rollback.
    if (legacyRegistered) {
        const legacyStop = await ensureLaunchdStopped(legacyLabel);
        if (!legacyStop.ok) {
            if (previousPlist !== null) writeFileSync(plistPath, previousPlist);
            else try { unlinkSync(plistPath); } catch { /* restore the pre-install file state */ }
            return {
                ok: false, action: 'perm', port, status: 'error',
                message: `legacy service could not be stopped safely${legacyStop.detail ? `: ${legacyStop.detail}` : ''}`,
                home, pid: null, command: ['launchctl', 'bootout', `${guiDomain()}/${legacyLabel}`],
            };
        }
    }

    // Confirm the current label is actually stopped before replacing or
    // regenerating it. A timeout is ambiguous and must never be treated as off.
    const currentStop = await ensureLaunchdStopped(label);
    if (!currentStop.ok) {
        if (previousPlist !== null) writeFileSync(plistPath, previousPlist);
        else try { unlinkSync(plistPath); } catch { /* restore the pre-install file state */ }
        return {
            ok: false, action: 'perm', port, status: 'error',
            message: `current service could not be stopped safely${currentStop.detail ? `: ${currentStop.detail}` : ''}`,
            home, pid: null, command: ['launchctl', 'bootout', `${guiDomain()}/${label}`],
        };
    }

    const { stderr, code } = await execLaunchctl(
        ['bootstrap', guiDomain(), plistPath],
        OP_TIMEOUT_MS,
    );

    if (code !== 0) {
        // bootstrap may time out after launchd accepted it. Stop and verify the
        // new label before restoring any previous service, otherwise both
        // labels could bind the same port.
        const rollbackStop = await ensureLaunchdStopped(label);
        if (previousPlist !== null) {
            writeFileSync(plistPath, previousPlist);
        } else {
            try { unlinkSync(plistPath); } catch { /* failed registration left no durable file */ }
        }

        let restoreError = '';
        if (rollbackStop.ok) {
            const restore = previousPlist !== null
                ? await execLaunchctl(['bootstrap', guiDomain(), plistPath], OP_TIMEOUT_MS)
                : legacyRegistered
                    ? await execLaunchctl(['bootstrap', guiDomain(), legacyPlistPath], OP_TIMEOUT_MS)
                    : null;
            if (restore && restore.code !== 0) restoreError = restore.stderr.trim() || 'previous service bootstrap failed';
        } else {
            restoreError = 'new service state could not be confirmed stopped; previous service was not restarted';
        }
        return {
            ok: false, action: 'perm', port, status: 'error',
            message: `bootstrap failed: ${stderr.trim()}${restoreError ? `; rollback: ${restoreError}` : ''}`,
            home, pid: null, command: ['launchctl', 'bootstrap', guiDomain(), plistPath],
        };
    }

    if (legacyRegistered) {
        try { unlinkSync(legacyPlistPath); } catch { /* migration cleanup is best-effort */ }
    }

    const state = await detectLaunchdState(port, home);
    return {
        ok: true, action: 'perm', port, status: 'permed',
        message: `registered as ${label}`,
        home, pid: state.pid, command: ['launchctl', 'bootstrap', guiDomain(), plistPath],
        expectedStateAfter: 'online',
    };
}

export async function unpermInstance(port: number, home: string): Promise<DashboardLifecycleResult> {
    if (!isLaunchdSupported()) {
        return { ok: false, action: 'unperm', port, status: 'rejected', message: 'macOS only', home, pid: null, command: [] };
    }

    const label = computeLaunchdLabel(port, home);
    if (!validateLabel(label)) {
        return { ok: false, action: 'unperm', port, status: 'rejected', message: 'invalid label', home, pid: null, command: [] };
    }

    const legacyLabel = computeLegacyLaunchdLabel(port, home);
    const legacyHome = legacyHomeForPort(port, home);
    const candidates = [
        { label, plistPath: computePlistPath(label), expectedHome: home },
        { label: legacyLabel, plistPath: computePlistPath(legacyLabel), expectedHome: legacyHome },
    ].filter(candidate => existsSync(candidate.plistPath));

    if (candidates.length === 0) {
        return { ok: false, action: 'unperm', port, status: 'rejected', message: 'no plist registered', home, pid: null, command: [] };
    }

    // Validate every exact candidate before mutating either one.
    for (const candidate of candidates) {
        if (!isManagedLaunchdPlist(candidate.plistPath, candidate.label, port, candidate.expectedHome)) {
            return { ok: false, action: 'unperm', port, status: 'rejected', message: 'plist label mismatch', home, pid: null, command: [] };
        }
    }

    for (const candidate of candidates) {
        await execLaunchctl(['bootout', `${guiDomain()}/${candidate.label}`], OP_TIMEOUT_MS);
        try { unlinkSync(candidate.plistPath); } catch { /* already gone */ }
    }

    const removedLabels = candidates.map(candidate => candidate.label).join(', ');

    return {
        ok: true, action: 'unperm', port, status: 'unpermed',
        message: `removed ${removedLabels}`,
        home, pid: null, command: ['launchctl', 'bootout', `${guiDomain()}/${candidates[0]!.label}`],
        expectedStateAfter: 'offline',
    };
}

export async function stopLaunchdInstance(label: string): Promise<DashboardLifecycleResult> {
    if (!validateOperableLabel(label)) {
        return { ok: false, action: 'stop', port: 0, status: 'rejected', message: 'invalid label', home: null, pid: null, command: [] };
    }
    const { code, stderr } = await execLaunchctl(['bootout', `${guiDomain()}/${label}`], OP_TIMEOUT_MS);
    if (code !== 0 && !stderr.includes('Could not find service')) {
        return { ok: false, action: 'stop', port: 0, status: 'error', message: `bootout failed: ${stderr.trim()}`, home: null, pid: null, command: ['launchctl', 'bootout'] };
    }
    return { ok: true, action: 'stop', port: 0, status: 'stopped', message: 'launchd service stopped (plist kept)', home: null, pid: null, command: ['launchctl', 'bootout'] };
}

export async function startLaunchdInstance(label: string, plistPath: string): Promise<DashboardLifecycleResult> {
    if (!validateOperableLabel(label, plistPath)) {
        return { ok: false, action: 'start', port: 0, status: 'rejected', message: 'invalid label', home: null, pid: null, command: [] };
    }
    if (!existsSync(plistPath)) {
        return { ok: false, action: 'start', port: 0, status: 'rejected', message: 'plist not found', home: null, pid: null, command: [] };
    }
    const { code, stderr } = await execLaunchctl(['bootstrap', guiDomain(), plistPath], OP_TIMEOUT_MS);
    if (code !== 0) {
        return { ok: false, action: 'start', port: 0, status: 'error', message: `bootstrap failed: ${stderr.trim()}`, home: null, pid: null, command: ['launchctl', 'bootstrap'] };
    }
    return { ok: true, action: 'start', port: 0, status: 'started', message: 'launchd service started', home: null, pid: null, command: ['launchctl', 'bootstrap'] };
}

export async function restartLaunchdInstance(label: string): Promise<DashboardLifecycleResult> {
    if (!validateOperableLabel(label)) {
        return { ok: false, action: 'restart', port: 0, status: 'rejected', message: 'invalid label', home: null, pid: null, command: [] };
    }
    const { code, stderr } = await execLaunchctl(['kickstart', '-k', `${guiDomain()}/${label}`], OP_TIMEOUT_MS);
    if (code !== 0) {
        return { ok: false, action: 'restart', port: 0, status: 'error', message: `kickstart failed: ${stderr.trim()}`, home: null, pid: null, command: ['launchctl', 'kickstart'] };
    }
    return { ok: true, action: 'restart', port: 0, status: 'restarted', message: 'launchd service restarted', home: null, pid: null, command: ['launchctl', 'kickstart', '-k'] };
}

