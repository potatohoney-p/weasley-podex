// Reverse-engineered Kiro / CodeWhisperer quota reader.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
    readKiroAuthFromStore,
    regionFromProfileArn,
    resolveKiroProfileArn,
} from '../agent/kiro-auth.js';
import { detectCli } from '../core/cli-detection.js';
import { stripUndefined } from '../core/strip-undefined.js';

const execFileAsync = promisify(execFile);

type QuotaRecord = Record<string, unknown>;

interface KiroUsageBreakdown {
    displayName?: string;
    displayNamePlural?: string;
    currentUsage?: number;
    currentUsageWithPrecision?: number;
    usageLimit?: number;
    usageLimitWithPrecision?: number;
    nextDateReset?: number;
    currentOverages?: number;
    overageCap?: number;
    resourceType?: string;
}

interface KiroUsageLimitsResponse {
    daysUntilReset?: number;
    nextDateReset?: number;
    subscriptionInfo?: {
        subscriptionTitle?: string;
        type?: string;
        overageCapability?: string;
    };
    usageBreakdownList?: KiroUsageBreakdown[];
    limits?: Array<{
        type?: string;
        currentUsage?: number;
        totalUsageLimit?: number;
        percentUsed?: number;
    }>;
}

function asRecord(value: unknown): QuotaRecord | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as QuotaRecord
        : null;
}

function numberField(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function isoFromEpochSeconds(value: unknown): string | null {
    const seconds = numberField(value);
    if (seconds == null) return null;
    const ms = seconds > 1e12 ? seconds : seconds * 1000;
    const date = new Date(ms);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function usedPercent(current?: number, limit?: number): number {
    if (current == null || limit == null || limit <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round((current / limit) * 100)));
}

export function normalizeKiroUsageLimits(data: KiroUsageLimitsResponse): QuotaRecord {
    const windows: Array<{ label: string; percent: number; resetsAt?: string | null }> = [];
    const subscription = data.subscriptionInfo || {};
    const resetsAt = isoFromEpochSeconds(data.nextDateReset);

    for (const breakdown of data.usageBreakdownList || []) {
        const current = breakdown.currentUsageWithPrecision ?? breakdown.currentUsage;
        const limit = breakdown.usageLimitWithPrecision ?? breakdown.usageLimit;
        const label = breakdown.displayName || breakdown.resourceType || 'Usage';
        if (current == null && limit == null) continue;
        windows.push(stripUndefined({
            label,
            percent: usedPercent(current, limit),
            resetsAt: isoFromEpochSeconds(breakdown.nextDateReset) ?? resetsAt,
        }) as { label: string; percent: number; resetsAt?: string | null });
    }

    for (const limit of data.limits || []) {
        if (windows.length) break;
        const label = limit.type || 'Usage';
        const percent = numberField(limit.percentUsed);
        windows.push(stripUndefined({
            label,
            percent: percent != null ? Math.round(percent) : usedPercent(limit.currentUsage, limit.totalUsageLimit),
            resetsAt,
        }) as { label: string; percent: number; resetsAt?: string | null });
    }

    const primaryBreakdown = data.usageBreakdownList?.[0];
    const subscriptionTitle = subscription.subscriptionTitle;
    const subscriptionType = subscription.type;

    return stripUndefined({
        authenticated: true,
        quotaCapable: windows.length > 0,
        quotaSource: 'kiro:codewhisperer-get-usage-limits',
        displayTier: subscriptionTitle
            ? `Kiro ${subscriptionTitle}`
            : subscriptionType
                ? `Kiro ${subscriptionType}`
                : 'Kiro',
        account: stripUndefined({
            type: 'kiro',
            tier: subscriptionTitle || subscriptionType || 'authenticated',
            plan: subscriptionType,
        }),
        windows,
        daysUntilReset: data.daysUntilReset,
        nextDateReset: resetsAt,
        currentUsage: primaryBreakdown?.currentUsageWithPrecision ?? primaryBreakdown?.currentUsage,
        usageLimit: primaryBreakdown?.usageLimitWithPrecision ?? primaryBreakdown?.usageLimit,
        usageUnit: primaryBreakdown?.displayNamePlural || primaryBreakdown?.displayName,
        overageStatus: asRecord(primaryBreakdown as unknown)?.['overageStatus'],
        reverseEngineered: true,
    });
}

export async function fetchKiroUsageLimits(
    accessToken: string,
    profileArn: string,
): Promise<KiroUsageLimitsResponse | QuotaRecord> {
    const region = regionFromProfileArn(profileArn);
    const url = `https://codewhisperer.${region}.amazonaws.com/`;

    try {
        const resp = await fetch(url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/x-amz-json-1.0',
                Accept: 'application/json',
                'X-Amz-Target': 'AmazonCodeWhispererService.GetUsageLimits',
            },
            body: JSON.stringify({ profileArn }),
            signal: AbortSignal.timeout(12000),
        });

        if (resp.status === 401 || resp.status === 403) {
            return { authenticated: false, reason: 'kiro_token_expired' };
        }
        if (!resp.ok) return { error: true, reason: `kiro_usage_http_${resp.status}` };

        return await resp.json() as KiroUsageLimitsResponse;
    } catch {
        return { error: true, reason: 'kiro_usage_fetch_failed' };
    }
}

async function readKiroWhoamiEmail(binary?: string): Promise<string | undefined> {
    const resolvedBinary = binary || detectCli('kiro-code').path;
    if (!resolvedBinary) return undefined;
    try {
        const { stdout } = await execFileAsync(resolvedBinary, ['whoami'], {
            encoding: 'utf8',
            timeout: 8000,
            env: { ...process.env, NO_COLOR: '1' },
        });
        const match = stdout.match(/([^\s@]+@[^\s@]+\.[^\s@]+)/);
        return match?.[1];
    } catch {
        return undefined;
    }
}

export async function fetchKiroUsage(binary?: string): Promise<QuotaRecord> {
    const resolvedBinary = binary || detectCli('kiro-code').path;
    const { token, profile } = readKiroAuthFromStore();
    const profileArn = resolveKiroProfileArn(token, profile);

    if (!token?.accessToken || !profileArn) {
        return stripUndefined({
            authenticated: false,
            quotaCapable: false,
            quotaSource: 'kiro:auth-store-missing',
            displayTier: 'Kiro',
            account: { type: 'kiro', tier: 'not logged in' },
            windows: [],
        });
    }

    const [usageResult, email] = await Promise.all([
        fetchKiroUsageLimits(token.accessToken, profileArn),
        readKiroWhoamiEmail(resolvedBinary || undefined),
    ]);

    if (asRecord(usageResult)?.['authenticated'] === false) {
        const reason = asRecord(usageResult)?.['reason'];
        return stripUndefined({
            authenticated: false,
            quotaCapable: false,
            quotaSource: 'kiro:codewhisperer-get-usage-limits',
            displayTier: 'Kiro',
            account: stripUndefined({
                type: 'kiro',
                tier: 'auth expired',
                email,
            }),
            windows: [],
            ...(typeof reason === 'string' ? { reason } : {}),
        });
    }

    if (asRecord(usageResult)?.['error']) {
        const reason = asRecord(usageResult)?.['reason'];
        return stripUndefined({
            authenticated: true,
            quotaCapable: false,
            quotaSource: 'kiro:codewhisperer-get-usage-limits',
            displayTier: 'Kiro',
            account: stripUndefined({
                type: 'kiro',
                tier: profile?.name || 'authenticated',
                email,
            }),
            windows: [],
            error: true,
            ...(typeof reason === 'string' ? { reason } : {}),
        });
    }

    const normalized = normalizeKiroUsageLimits(usageResult as KiroUsageLimitsResponse);
    return stripUndefined({
        ...normalized,
        account: {
            ...(asRecord(normalized['account']) || {}),
            email,
            profileArn,
        },
    });
}
