import { getWeasleyPodexEnv } from './weasley-podex-env.js';
/**
 * Shared instance utilities for launchd / systemd / docker service management.
 * Zero dependencies beyond node:* and config.ts.
 */
import { execFileSync } from 'node:child_process';
import { basename, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { DEFAULT_WEASLEY_PODEX_HOME, WEASLEY_PODEX_HOME, LEGACY_PODEX_HOME } from './config.js';
import { buildServicePath, resolveBundledNodePath } from './runtime-path.js';

/**
 * Derive a human-readable instance ID from WEASLEY_PODEX_HOME.
 * Default home (~/.weasley/podex) → 'default'
 * Custom home → '<basename>-<hash8>'
 */
export function instanceId(): string {
    const base = basename(WEASLEY_PODEX_HOME);
    if ([DEFAULT_WEASLEY_PODEX_HOME, LEGACY_PODEX_HOME].some(home => resolve(home) === resolve(WEASLEY_PODEX_HOME))) return 'default';
    const hash = createHash('md5').update(WEASLEY_PODEX_HOME).digest('hex').slice(0, 8);
    return `${base.replace(/^\./, '')}-${hash}`;
}

export { buildServicePath } from './runtime-path.js';

function whichWithServicePath(binary: string): string {
    const lookup = process.platform === 'win32' ? 'where' : 'which';
    return execFileSync(lookup, [binary], {
        encoding: 'utf8',
        env: {
            ...process.env,
            PATH: buildServicePath(process.env["PATH"] || ''),
        },
    }).trim().split(/\r?\n/)[0]!;
}

/** Resolve absolute path to node binary. */
export function getNodePath(): string {
    const bundledNode = resolveBundledNodePath();
    if (bundledNode) return bundledNode;

    try { return whichWithServicePath('node'); }
    catch { return process.execPath || '/usr/local/bin/node'; }
}

/** Resolve the sole public Weasley Podex CLI. */
export function getJawPath(): string {
    const configuredBin = getWeasleyPodexEnv('BIN');
    if (configuredBin) return configuredBin;
    const argvPath = process.argv[1];
    if (argvPath && /(?:^|[\\/])(?:weasley-podex(?:\.js)?|podex\.js)$/.test(argvPath)) return argvPath;
    return whichWithServicePath('weasley-podex');
}

/**
 * Sanitize a string for use as a systemd unit name.
 * Allowed: [a-zA-Z0-9:._-]
 * @see systemd.unit(5)
 */
export function sanitizeUnitName(name: string): string {
    return name.replace(/[^a-zA-Z0-9:._-]/g, '-');
}

