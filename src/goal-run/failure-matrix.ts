import type { FailureDecision } from './types.js';

export function classifyFailure(context: {
    phase: string;
    failureType: 'audit-fail' | 'test-fail' | 'dispatch-fail' | 'type-error' | 'timeout' | 'unknown';
    retryCount: number;
}): FailureDecision {
    const { phase, failureType, retryCount } = context;

    if (failureType === 'audit-fail') {
        return { action: 'follow-up-plan', reason: 'Audit found issues. A revised plan is needed.' };
    }

    if (failureType === 'test-fail') {
        if (retryCount < 2) {
            return { action: 'retry', reason: 'Test failure — retrying with fixes.', maxRetries: 2 };
        }
        return { action: 'stop', reason: 'Test failures persist after retries.' };
    }

    if (failureType === 'dispatch-fail') {
        if (retryCount < 1) {
            return { action: 'retry', reason: 'Dispatch failed — one retry allowed.', maxRetries: 1 };
        }
        return { action: 'ask', reason: 'Dispatch failed repeatedly. Needs user decision.' };
    }

    if (failureType === 'type-error') {
        return { action: 'stop', reason: `Type error in ${phase} phase. Manual fix required.` };
    }

    if (failureType === 'timeout') {
        return { action: 'stop', reason: 'Operation timed out.' };
    }

    return { action: 'stop', reason: `Unknown failure in ${phase} phase.` };
}
