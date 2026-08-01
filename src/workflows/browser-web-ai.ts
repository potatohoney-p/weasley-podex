// Converts workflow intents into web-ai observation/action contracts.
// Does NOT import provider SDKs. Uses capability registry for safety.

import type { WorkflowGuardResult } from './types.js';
import { guardPass, guardBlock } from './guards.js';

export type BrowserWorkflowIntent = 'research' | 'advisory-critique' | 'prompt-submission';

export interface BrowserWorkflowRequest {
    intent: BrowserWorkflowIntent;
    vendor: string;
    prompt: string;
    requireSourceAudit: boolean;
}

export function checkBrowserWorkflowGuard(
    intent: BrowserWorkflowIntent,
    mutationAllowed: boolean,
): WorkflowGuardResult {
    if (intent === 'prompt-submission' && !mutationAllowed) {
        return guardBlock(
            'mutation-not-allowed',
            'This vendor capability does not allow mutation. Use research or advisory-critique intent.',
        );
    }
    return guardPass('browser-workflow-ok', `Intent ${intent} is allowed.`);
}

export function buildBrowserWorkflowEnvelope(request: BrowserWorkflowRequest): {
    vendor: string;
    prompt: string;
    mode: BrowserWorkflowIntent;
    sourceAuditRequired: boolean;
} {
    return {
        vendor: request.vendor,
        prompt: request.prompt,
        mode: request.intent,
        sourceAuditRequired: request.requireSourceAudit,
    };
}
