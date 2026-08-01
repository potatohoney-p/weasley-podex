// Normalize workflow events for trace store and ProcessBlock rendering.
// Does NOT import provider SDKs.

import type { WorkflowEvent, WorkflowEventKind, WorkflowEventStatus } from './types.js';

let globalSequence = 0;

export function nextSequenceId(): number {
    return ++globalSequence;
}

export function createWorkflowEvent(
    workflowId: string,
    kind: WorkflowEventKind,
    status: WorkflowEventStatus,
    label: string,
    detail?: unknown,
): WorkflowEvent {
    return {
        schemaVersion: 'workflow-event-v1',
        workflowId,
        sequenceId: nextSequenceId(),
        createdAt: new Date().toISOString(),
        kind,
        status,
        label,
        detail,
    };
}

export function isNewerEvent(incoming: WorkflowEvent, existing: WorkflowEvent): boolean {
    if (incoming.workflowId !== existing.workflowId) return true;
    return incoming.sequenceId > existing.sequenceId;
}
