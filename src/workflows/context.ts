// Builds WorkflowRunContext from existing jaw state.
// Does NOT import provider SDKs.

import { getState, getCtx } from '../orchestrator/state-machine.js';
import { settings } from '../core/config.js';
import type { WorkflowRunContext, WorkflowSource } from './types.js';

export function buildWorkflowRunContext(
    source: WorkflowSource,
    overrides?: Partial<WorkflowRunContext>,
): WorkflowRunContext {
    const orcState = getState();
    const ctx = getCtx();
    const workingDir = settings?.['workingDir'];

    return {
        repoRoot: (typeof workingDir === 'string' && workingDir) || null,
        source,
        orcState,
        worklogPath: ctx?.worklogPath ?? undefined,
        goalId: undefined,
        traceRunId: undefined,
        ...overrides,
    };
}
