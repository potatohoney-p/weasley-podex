// Uses capability registry to block unsupported/mutation-unsafe workflow actions.
// Does NOT import provider SDKs.

import type { WorkflowGuardResult } from './types.js';
import { guardPass, guardBlock } from './guards.js';

export function checkVendorSupported(vendor: string, supportedVendors: string[]): WorkflowGuardResult {
    if (!supportedVendors.includes(vendor)) {
        return guardBlock(
            'vendor-unsupported',
            `Vendor "${vendor}" is not in the supported list: ${supportedVendors.join(', ')}`,
        );
    }
    return guardPass('vendor-supported', `Vendor "${vendor}" is supported.`);
}

export function checkMutationSafe(capabilityId: string, mutationAllowed: boolean): WorkflowGuardResult {
    if (!mutationAllowed) {
        return guardBlock(
            'mutation-blocked',
            `Capability "${capabilityId}" does not allow mutation.`,
        );
    }
    return guardPass('mutation-allowed', `Capability "${capabilityId}" allows mutation.`);
}

export function checkSourceAuditResult(
    auditPassed: boolean,
    claimCount: number,
): WorkflowGuardResult {
    if (!auditPassed) {
        return guardBlock(
            'source-audit-failed',
            `Source audit failed with ${claimCount} unsourced claim(s). Results are advisory only.`,
        );
    }
    return guardPass('source-audit-passed', 'All claims are sourced.');
}
