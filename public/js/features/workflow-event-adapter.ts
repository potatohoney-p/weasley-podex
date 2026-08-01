// Converts WorkflowEvent into ProcessBlock rows and cockpit state patches.
// Does NOT import AI SDK UI packages.

import { state } from '../state.js';

export type WorkflowEventKind =
    | 'command'
    | 'goal'
    | 'goal-run'
    | 'handoff'
    | 'guard'
    | 'checkpoint';

export type WorkflowEventStatus =
    | 'started'
    | 'blocked'
    | 'running'
    | 'done'
    | 'failed';

export interface WorkflowEventMessage {
    schemaVersion: 'workflow-event-v1';
    workflowId: string;
    sequenceId: number;
    createdAt: string;
    kind: WorkflowEventKind;
    status: WorkflowEventStatus;
    label: string;
    detail?: unknown;
}

const appliedSequences = new Map<string, number>();

export function shouldApplyEvent(event: WorkflowEventMessage): boolean {
    const lastSeq = appliedSequences.get(event.workflowId) ?? -1;
    return event.sequenceId > lastSeq;
}

export function markEventApplied(event: WorkflowEventMessage): void {
    appliedSequences.set(event.workflowId, event.sequenceId);
}

export function hasSequenceGap(event: WorkflowEventMessage): boolean {
    const lastSeq = appliedSequences.get(event.workflowId) ?? -1;
    if (lastSeq === -1) return false;
    return event.sequenceId > lastSeq + 1;
}

export function resetEventTracking(): void {
    appliedSequences.clear();
}

export function applyWorkflowEvent(event: WorkflowEventMessage): {
    applied: boolean;
    gapDetected: boolean;
} {
    if (!shouldApplyEvent(event)) {
        return { applied: false, gapDetected: false };
    }

    const gapDetected = hasSequenceGap(event);
    markEventApplied(event);

    if (event.kind === 'goal') {
        updateGoalCockpitFromEvent(event);
    }

    return { applied: true, gapDetected };
}

function updateGoalCockpitFromEvent(event: WorkflowEventMessage): void {
    if (!state.activeGoal) return;

    if (event.status === 'done' && event.kind === 'goal') {
        state.activeGoal = null;
    }
}
