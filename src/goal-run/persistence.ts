import type { GoalRunState } from './types.js';

export class GoalRunStateError extends Error {
    readonly statusCode = 409;

    constructor(detail: string, readonly code: 'goal_run_state_invalid' | 'goal_run_state_unreadable' = 'goal_run_state_invalid') {
        super(`Saved goal run in goal/active-run.json is unavailable: ${detail}. Preserve a backup, repair the file, then retry. No saved data was changed.`);
        this.name = 'GoalRunStateError';
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function invalid(field: string, expected: string): never {
    // Report only field names and expected types, never persisted values.
    throw new GoalRunStateError(`${field} must be ${expected}`);
}

export function parseGoalRunState(text: string): GoalRunState {
    let value: unknown;
    try { value = JSON.parse(text); }
    catch { throw new GoalRunStateError('invalid JSON'); }

    if (!isRecord(value)) return invalid('root', 'an object');
    if (typeof value['goalId'] !== 'string' || !value['goalId'].trim()) invalid('goalId', 'a nonempty string');
    if (typeof value['mode'] !== 'string' || !['dry-run', 'assist', 'bounded', 'supervised'].includes(value['mode'])) invalid('mode', 'a supported run mode');
    if (typeof value['status'] !== 'string' || !['preflight', 'running', 'paused', 'stopped', 'completed', 'failed'].includes(value['status'])) invalid('status', 'a supported run status');

    const budget = value['budget'];
    if (!isRecord(budget)) return invalid('budget', 'an object');
    for (const field of ['maxTurns', 'maxMinutes', 'maxDispatches', 'turnsUsed', 'minutesUsed', 'dispatchesUsed']) {
        const amount = budget[field];
        if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) invalid(`budget.${field}`, 'a finite nonnegative number');
        if (!field.toLowerCase().includes('minutes') && !Number.isSafeInteger(amount)) invalid(`budget.${field}`, 'a nonnegative safe integer');
    }

    const gates = value['gates'];
    if (!Array.isArray(gates)) return invalid('gates', 'an array');
    for (const [index, gate] of gates.entries()) {
        if (!isRecord(gate)) return invalid(`gates[${index}]`, 'an object');
        if (typeof gate['gate'] !== 'string' || !gate['gate'].trim()) invalid(`gates[${index}].gate`, 'a nonempty string');
        if (typeof gate['passed'] !== 'boolean') invalid(`gates[${index}].passed`, 'a boolean');
        if (gate['reason'] !== undefined && typeof gate['reason'] !== 'string') invalid(`gates[${index}].reason`, 'a string');
    }
    for (const field of ['startedAt', 'stoppedAt', 'lastActiveAt']) {
        const timestamp = value[field];
        if (timestamp !== undefined && (typeof timestamp !== 'string' || !Number.isFinite(Date.parse(timestamp)))) invalid(field, 'a valid date string');
    }
    if (value['lastError'] !== undefined && typeof value['lastError'] !== 'string') invalid('lastError', 'a string');

    // Preserve unknown additive fields and optional legacy fields on round trips.
    return value as unknown as GoalRunState;
}
