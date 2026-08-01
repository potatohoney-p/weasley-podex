// Mirrored from agbrowse adaptive-fetch v2; keep runtime behavior aligned while podex mirror remains experimental.

import type { AttemptTrace, FetchAttempt } from './types.js';
import { redactHeaders, redactTraceValue } from './safety.js';

export function createAttemptTrace(input: { url?: string; browserMode?: string; browserSession?: string } = {}): AttemptTrace {
    return {
        url: typeof input.url === 'string' ? redactTraceValue(input.url) as string : null,
        browserMode: input.browserMode || 'auto',
        browserSession: input.browserSession || 'none',
        createdAt: new Date().toISOString(),
        attempts: [],
    };
}

export function appendAttempt(trace: AttemptTrace, attempt: FetchAttempt): Record<string, unknown> {
    const safeAttempt = sanitizeAttempt({
        ...attempt,
        at: attempt.at || new Date().toISOString(),
    });
    trace.attempts.push(safeAttempt as FetchAttempt);
    return safeAttempt;
}

export function summarizeAttempts(attempts: FetchAttempt[] = []): string {
    if (attempts.length === 0) return 'No attempts recorded.';
    const last = attempts[attempts.length - 1]!;
    const source = last.source || 'unknown';
    const verdict = last.verdict || 'unknown';
    return `${attempts.length} attempt(s); last source=${source} verdict=${verdict}`;
}

export function sanitizeAttempt(attempt: Record<string, unknown>): Record<string, unknown> {
    const safe: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(attempt)) {
        if (key.toLowerCase().includes('header') && value && typeof value === 'object' && !Array.isArray(value)) {
            safe[key] = redactHeaders(value as Record<string, unknown>);
        } else if (typeof value === 'string') {
            safe[key] = redactTraceValue(value);
        } else if (Array.isArray(value)) {
            safe[key] = value.map(item => typeof item === 'string' ? redactTraceValue(item) : item);
        } else {
            safe[key] = value;
        }
    }
    return safe;
}

