// Common guard result type and composable helpers.
// Does NOT import provider SDKs.

import type { WorkflowGuardResult } from './types.js';

export function guardPass(code: string, message: string): WorkflowGuardResult {
    return { ok: true, code, message, severity: 'info' };
}

export function guardWarn(code: string, message: string): WorkflowGuardResult {
    return { ok: true, code, message, severity: 'warn' };
}

export function guardBlock(code: string, message: string): WorkflowGuardResult {
    return { ok: false, code, message, severity: 'block' };
}

export function allGuardsPassed(results: WorkflowGuardResult[]): boolean {
    return results.every(r => r.ok);
}

export function blockedGuards(results: WorkflowGuardResult[]): WorkflowGuardResult[] {
    return results.filter(r => !r.ok);
}
