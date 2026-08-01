// Builds Boss-safe employee dispatch tasks from workflow metadata.
// Does NOT import provider SDKs.

import type { OrcStateName } from '../orchestrator/state-machine.js';
import type { WorkflowHandoff, WorkflowHandoffMode } from './types.js';

const VERDICT_TOKENS: Record<string, string[]> = {
    A: ['PASS', 'FAIL'],
    B: ['DONE', 'NEEDS_FIX'],
    advisory: ['PASS', 'NEEDS_FIX'],
};

export function buildHandoff(opts: {
    projectRoot: string;
    phase: OrcStateName;
    mode: WorkflowHandoffMode;
    taskDescription: string;
    mutable?: boolean;
    scope?: string;
}): WorkflowHandoff {
    const verdictKey = opts.mode === 'advisory'
        ? 'advisory'
        : (opts.phase === 'A' || opts.phase === 'B') ? opts.phase : 'advisory';

    const verdictTokens = VERDICT_TOKENS[verdictKey] ?? ['PASS', 'FAIL'];

    let modeHeader: string;
    if (opts.mutable) {
        const scopeNote = opts.scope
            ? `Files inside \`${opts.scope}\` may be created or modified.`
            : 'Files in the project may be created or modified.';
        modeHeader = `WRITE-ENABLED session. ${scopeNote} Protected files (.git, .env, settings.json) are still blocked.`;
    } else {
        modeHeader = opts.mode === 'read-only'
            ? 'READ-ONLY verification. Do not modify files.'
            : opts.mode === 'verification'
                ? 'VERIFICATION only. Do not implement new code.'
                : 'Advisory review. Results are non-binding.';
    }

    const taskBody = [
        `Project root: ${opts.projectRoot}`,
        '',
        modeHeader,
        'If unsure of state, inspect before acting. Never chain actions through uncertainty.',
        `Report verdict as one of: ${verdictTokens.join(' | ')}`,
        '',
        opts.taskDescription,
    ].join('\n');

    return {
        projectRoot: opts.projectRoot,
        mode: opts.mode,
        phase: opts.phase,
        taskBody,
        verdictTokens,
    };
}

const IMPL_DELEGATION_PATTERN = /\b(implement(?:\s+the\s+feature|\s+this|\s+code)?|write\s+(?:the\s+)?(?:code|function)|create\s+(?:the\s+)?file|build\s+(?:the\s+)?(?:feature|module)|add\s+(?:the\s+)?(?:method|function|class))\b/i;

export function hasImplementationDelegation(taskBody: string): boolean {
    return IMPL_DELEGATION_PATTERN.test(taskBody);
}
