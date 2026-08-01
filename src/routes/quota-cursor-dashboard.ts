// Reverse-engineered Cursor dashboard quota reader (unofficial API).

import fs from 'fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'path';
import { WEASLEY_PODEX_HOME, SETTINGS_PATH } from '../core/config.js';
import { stripUndefined } from '../core/strip-undefined.js';

const execFileAsync = promisify(execFile);

const CURSOR_USAGE_SUMMARY_URL = 'https://cursor.com/api/usage-summary';
const CURSOR_SESSION_TOKEN_FILE = join(WEASLEY_PODEX_HOME, 'quota', 'cursor-session-token');

type QuotaRecord = Record<string, unknown>;

async function readCursorJsonCommand(binary: string, command: string, args: string[] = []): Promise<QuotaRecord | null> {
    try {
        const { stdout } = await execFileAsync(binary, [command, ...args], {
            encoding: 'utf8',
            timeout: 5000,
        });
        const parsed = JSON.parse(stdout) as unknown;
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? parsed as QuotaRecord
            : null;
    } catch {
        return null;
    }
}

export function readCursorDashboardSessionToken(): string | null {
    for (const key of ['CURSOR_SESSION_TOKEN', 'CURSOR_DASHBOARD_SESSION_TOKEN']) {
        const value = process.env[key]?.trim();
        if (value) return value;
    }
    try {
        const fromFile = fs.readFileSync(CURSOR_SESSION_TOKEN_FILE, 'utf8').trim();
        if (fromFile) return fromFile;
    } catch { /* optional local token file */ }
    try {
        const settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8')) as Record<string, unknown>;
        const quota = settings['quota'];
        if (quota && typeof quota === 'object' && !Array.isArray(quota)) {
            const token = (quota as Record<string, unknown>)['cursorSessionToken'];
            if (typeof token === 'string' && token.trim()) return token.trim();
        }
    } catch { /* settings may be absent during tests */ }
    return null;
}

export async function readCursorStatus(binary = 'cursor-agent'): Promise<QuotaRecord> {
    let authenticated = false;
    let source = 'none';
    let subscriptionTier: string | undefined;
    let cliVersion: string | undefined;
    let userEmail: string | undefined;
    let defaultModel: string | undefined;

    if (process.env["CURSOR_API_KEY"]?.trim()) {
        authenticated = true;
        source = 'CURSOR_API_KEY';
    }

    const [status, about] = await Promise.all([
        readCursorJsonCommand(binary, 'status', ['--format', 'json']),
        readCursorJsonCommand(binary, 'about', ['--format', 'json']),
    ]);
    if (status) {
        authenticated = status["isAuthenticated"] === true
            || status["status"] === 'authenticated'
            || authenticated;
        const userInfo = status["userInfo"];
        if (userInfo && typeof userInfo === 'object' && !Array.isArray(userInfo)) {
            const email = (userInfo as QuotaRecord)["email"];
            if (typeof email === 'string' && email.trim()) userEmail = email;
        }
        if (authenticated && source === 'none') source = 'cursor-agent status';
    }

    if (about) {
        if (typeof about["subscriptionTier"] === 'string') subscriptionTier = about["subscriptionTier"];
        if (typeof about["cliVersion"] === 'string') cliVersion = about["cliVersion"];
        if (typeof about["model"] === 'string') defaultModel = about["model"];
        if (typeof about["userEmail"] === 'string' && about["userEmail"].trim()) {
            userEmail = about["userEmail"];
        }
        if (authenticated && source === 'none') source = 'cursor-agent about';
    }

    return stripUndefined({
        authenticated,
        quotaCapable: false,
        quotaSource: 'not-exposed-by-cursor-cli',
        futureQuotaHook: 'cursor-dashboard-unofficial-api',
        displayTier: subscriptionTier ? `Cursor ${subscriptionTier}` : 'Cursor',
        account: stripUndefined({
            type: 'cursor',
            tier: subscriptionTier ?? 'auth/status only',
            email: userEmail,
        }),
        source,
        cliVersion,
        defaultModel,
        subscriptionTier,
        windows: [],
    });
}

function asRecord(value: unknown): QuotaRecord | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as QuotaRecord
        : null;
}

function numberField(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function normalizeCursorUsageSummary(data: QuotaRecord): QuotaRecord {
    const individualUsage = asRecord(data["individualUsage"]);
    const plan = asRecord(individualUsage?.["plan"]);
    const windows: Array<{ label: string; percent: number; resetsAt?: string | null }> = [];
    const resetsAt = typeof data["billingCycleEnd"] === 'string' ? data["billingCycleEnd"] : null;
    const membershipType = typeof data["membershipType"] === 'string' ? data["membershipType"] : undefined;

    const totalPercentUsed = numberField(plan?.["totalPercentUsed"]);
    const apiPercentUsed = numberField(plan?.["apiPercentUsed"]);
    const autoPercentUsed = numberField(plan?.["autoPercentUsed"]);

    if (totalPercentUsed != null) {
        windows.push({ label: 'Cycle', percent: Math.round(totalPercentUsed), resetsAt });
    } else if (apiPercentUsed != null) {
        windows.push({ label: 'API', percent: Math.round(apiPercentUsed), resetsAt });
    }
    if (autoPercentUsed != null && autoPercentUsed > 0) {
        windows.push({ label: 'Auto', percent: Math.round(autoPercentUsed), resetsAt });
    }

    return stripUndefined({
        authenticated: true,
        quotaCapable: windows.length > 0,
        quotaSource: 'cursor-dashboard-unofficial-api',
        displayTier: membershipType ? `Cursor ${membershipType}` : 'Cursor',
        account: stripUndefined({
            type: 'cursor',
            tier: membershipType,
            plan: membershipType,
        }),
        windows,
        billingCycleStart: data["billingCycleStart"],
        billingCycleEnd: data["billingCycleEnd"],
        planUsed: plan?.["used"],
        planLimit: plan?.["limit"],
        planRemaining: plan?.["remaining"],
        reverseEngineered: true,
    });
}

export async function fetchCursorDashboardUsage(sessionToken: string): Promise<QuotaRecord | null> {
    try {
        const resp = await fetch(CURSOR_USAGE_SUMMARY_URL, {
            headers: { Cookie: `WorkosCursorSessionToken=${sessionToken}` },
            signal: AbortSignal.timeout(8000),
        });
        if (resp.status === 401 || resp.status === 403) {
            return { authenticated: false, reason: 'dashboard_session_expired' };
        }
        if (!resp.ok) return { error: true };
        const data = await resp.json() as QuotaRecord;
        return normalizeCursorUsageSummary(data);
    } catch {
        return { error: true };
    }
}

function mergeCursorQuota(base: QuotaRecord, overlay: QuotaRecord | null): QuotaRecord {
    if (!overlay) return base;
    if (overlay["authenticated"] === false) {
        return stripUndefined({
            ...base,
            dashboardAuth: false,
            dashboardHint: 'Set CURSOR_SESSION_TOKEN or ~/.weasley/podex/quota/cursor-session-token from cursor.com dashboard cookie WorkosCursorSessionToken',
        });
    }
    if (overlay["error"]) {
        return stripUndefined({ ...base, error: true, reason: 'dashboard_fetch_failed' });
    }
    return stripUndefined({
        ...base,
        ...overlay,
        authenticated: base["authenticated"] !== false,
        account: { ...(asRecord(base["account"]) || {}), ...(asRecord(overlay["account"]) || {}) },
    });
}

export async function fetchCursorUsage(binary = 'cursor-agent'): Promise<QuotaRecord> {
    const base = await readCursorStatus(binary);
    const sessionToken = readCursorDashboardSessionToken();
    if (!sessionToken) return base;
    const dashboard = await fetchCursorDashboardUsage(sessionToken);
    return mergeCursorQuota(base, dashboard);
}

