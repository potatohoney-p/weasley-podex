// Converts goal-run decisions into WorkflowEvent records.
// Does NOT import provider SDKs.

import { createWorkflowEvent } from '../workflows/events.js';
import type { WorkflowEvent } from '../workflows/types.js';

export function goalRunStartedEvent(goalId: string, mode: string): WorkflowEvent {
    return createWorkflowEvent(goalId, 'goal-run', 'started', `Goal run started in ${mode} mode`);
}

export function goalRunPhaseEvent(goalId: string, phase: string, status: 'running' | 'done' | 'blocked'): WorkflowEvent {
    return createWorkflowEvent(goalId, 'goal-run', status, `Phase ${phase} ${status}`);
}

export function goalRunGuardEvent(goalId: string, guardCode: string, passed: boolean): WorkflowEvent {
    return createWorkflowEvent(
        goalId,
        'guard',
        passed ? 'done' : 'blocked',
        `Guard ${guardCode}: ${passed ? 'passed' : 'blocked'}`,
    );
}

export function goalRunHandoffEvent(goalId: string, employee: string, phase: string): WorkflowEvent {
    return createWorkflowEvent(goalId, 'handoff', 'started', `Handoff to ${employee} in phase ${phase}`);
}

export function goalRunCheckpointEvent(goalId: string, summary: string): WorkflowEvent {
    return createWorkflowEvent(goalId, 'checkpoint', 'done', summary);
}

export function goalRunFailedEvent(goalId: string, reason: string): WorkflowEvent {
    return createWorkflowEvent(goalId, 'goal-run', 'failed', reason);
}

export function goalRunCompletedEvent(goalId: string): WorkflowEvent {
    return createWorkflowEvent(goalId, 'goal-run', 'done', 'Goal run completed');
}
