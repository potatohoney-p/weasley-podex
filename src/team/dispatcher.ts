// Converts team lanes into Boss-only dispatch tasks.
// Does NOT import provider SDKs.

import { buildHandoff } from '../workflows/handoff.js';
import type { TeamLane, TeamPlan } from './types.js';
import type { WorkflowHandoff } from '../workflows/types.js';

export function buildTeamDispatchTask(
    lane: TeamLane,
    plan: TeamPlan,
    projectRoot: string,
): WorkflowHandoff {
    const scopeText = lane.scope.length
        ? `File scope: ${lane.scope.join(', ')}`
        : 'No specific file scope assigned.';

    const taskDescription = [
        `Team: ${plan.teamId}`,
        `Lane: ${lane.laneId}`,
        `Role: ${lane.role}`,
        `Mode: ${plan.mode}`,
        scopeText,
        '',
        `Request: ${plan.request}`,
    ].join('\n');

    const mode = plan.mode === 'audit-team' || plan.mode === 'research-team'
        ? 'read-only' as const
        : plan.mode === 'verify-team'
            ? 'verification' as const
            : 'read-only' as const;

    return buildHandoff({
        projectRoot,
        phase: 'A',
        mode,
        taskDescription,
    });
}

export function buildAllDispatchTasks(
    plan: TeamPlan,
    projectRoot: string,
): Array<{ lane: TeamLane; handoff: WorkflowHandoff }> {
    return plan.lanes.map(lane => ({
        lane,
        handoff: buildTeamDispatchTask(lane, plan, projectRoot),
    }));
}
