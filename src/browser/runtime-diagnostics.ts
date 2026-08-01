import { getActivePort, getBrowserRuntimeStatus, getBrowserStatus } from './connection.js';
import type { BrowserRuntimeStatus } from './runtime-owner.js';
import { inspectBrowserRuntimeOrphans, type BrowserRuntimeOrphanCandidate } from './runtime-orphans.js';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { WEASLEY_PODEX_HOME } from '../core/config.js';

export type BrowserRuntimeIssueCode =
    | 'stale-weasley-podex-owned-runtime'
    | 'external-runtime-not-autoclosed'
    | 'orphan-runtime-candidate'
    | 'chrome-singleton-risk'
    | 'stale-singleton-lock';

export interface BrowserRuntimeIssue {
    code: BrowserRuntimeIssueCode;
    severity: 'info' | 'warn';
    message: string;
}

export interface BrowserRuntimeDiagnostics {
    ok: boolean;
    port: number;
    status: Awaited<ReturnType<typeof getBrowserStatus>>;
    runtime: BrowserRuntimeStatus;
    cleanup: {
        idleAutoClose: boolean;
        idleAutoCloseScope: 'current-server-weasley-podex-owned-runtime' | 'none';
        orphanJanitor: true;
        orphanJanitorScope: 'durable-weasley-podex-owned-runtime-records-only';
        safeExternalKill: false;
    };
    orphanCandidates: BrowserRuntimeOrphanCandidate[];
    issues: BrowserRuntimeIssue[];
    recommendations: string[];
}

export async function getBrowserDiagnostics(port = getActivePort()): Promise<BrowserRuntimeDiagnostics> {
    const status = await getBrowserStatus(port);
    const runtime = getBrowserRuntimeStatus();
    const orphanCandidates = await inspectBrowserRuntimeOrphans(runtime);
    const issues: BrowserRuntimeIssue[] = [];
    const recommendations: string[] = [];

    if (!status.running && runtime.ownership === 'weasley-podex-owned') {
        issues.push({
            code: 'stale-weasley-podex-owned-runtime',
            severity: 'warn',
            message: 'The server still has Weasley Podex-owned runtime metadata, but the expected CDP endpoint is not responding.',
        });
        recommendations.push('Run weasley-podex browser start again; launchChrome now clears stale Weasley Podex-owned process memory before retrying.');
    }

    if (runtime.ownership === 'external') {
        issues.push({
            code: 'external-runtime-not-autoclosed',
            severity: 'info',
            message: 'Weasley Podex is attached to an external CDP browser and will not auto-close that process.',
        });
        recommendations.push('Use the owner that launched the external Chrome to close it; Weasley Podex only disconnects from external runtimes.');
    }

    if (orphanCandidates.some((candidate) => candidate.action !== 'none')) {
        issues.push({
            code: 'orphan-runtime-candidate',
            severity: 'warn',
            message: 'A durable Weasley Podex-owned browser runtime record exists outside the current server runtime.',
        });
        recommendations.push('Run weasley-podex browser cleanup-runtimes for a dry-run, then add --close --force only if the candidate is expected.');
    }

    detectChromeSingleton(issues, recommendations);

    const cleanup = {
        idleAutoClose: runtime.autoCloseEnabled === true,
        idleAutoCloseScope: runtime.ownership === 'weasley-podex-owned'
            ? 'current-server-weasley-podex-owned-runtime' as const
            : 'none' as const,
        orphanJanitor: true as const,
        orphanJanitorScope: 'durable-weasley-podex-owned-runtime-records-only' as const,
        safeExternalKill: false as const,
    };

    const ok = !issues.some((issue) => issue.severity === 'warn');
    return { ok, port, status, runtime, cleanup, orphanCandidates, issues, recommendations };
}

function detectChromeSingleton(issues: BrowserRuntimeIssue[], recommendations: string[]): void {
    const PROFILE_DIR = join(WEASLEY_PODEX_HOME, 'browser-profile');

    if (process.platform === 'win32') {
        try {
            const ps = spawnSync('tasklist', ['/FI', 'IMAGENAME eq chrome.exe', '/NH'], {
                encoding: 'utf8', timeout: 3000,
            });
            const chromeLines = (ps.stdout || '').trim().split('\n')
                .filter((l: string) => l.toLowerCase().includes('chrome.exe'));
            if (chromeLines.length > 0) {
                issues.push({
                    code: 'chrome-singleton-risk',
                    severity: 'warn',
                    message: `${chromeLines.length} chrome.exe process(es) running — singleton risk if profile dir creation fails.`,
                });
                recommendations.push('Weasley Podex uses a unique profile to avoid absorption. If launch fails, close all Chrome windows.');
            }
        } catch {
            // tasklist unavailable
        }
    } else if (process.platform === 'linux') {
        const singletonLock = join(PROFILE_DIR, 'SingletonLock');
        if (existsSync(singletonLock)) {
            issues.push({
                code: 'stale-singleton-lock',
                severity: 'warn',
                message: `Stale SingletonLock found at ${singletonLock}.`,
            });
            recommendations.push(`rm -f "${PROFILE_DIR}/Singleton*" then retry.`);
        }
    }
}

