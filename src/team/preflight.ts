// Checks team preflight conditions: overlap, PABCD state, worker busy/replay, mode permissions.
// Does NOT import provider SDKs.

import type { WorkflowGuardResult } from '../workflows/types.js';
import { guardPass, guardBlock } from '../workflows/guards.js';
import type { TeamPlan, TeamMode } from './types.js';
import { hasOverlappingScopes } from './planner.js';

const WRITE_MODES: TeamMode[] = ['implementation-team', 'repair-team'];

export function checkTeamPreflight(opts: {
    plan: TeamPlan;
    orcState: string;
    workerBusy: boolean;
    pendingReplay: boolean;
}): WorkflowGuardResult[] {
    const guards: WorkflowGuardResult[] = [];

    if (opts.orcState !== 'IDLE' && opts.orcState !== 'A') {
        guards.push(guardBlock('team-orc-state', `PABCD state is ${opts.orcState}, team requires IDLE or A`));
    } else {
        guards.push(guardPass('team-orc-state', 'PABCD state allows team'));
    }

    if (opts.workerBusy) {
        guards.push(guardBlock('team-worker-busy', 'Workers are busy'));
    } else {
        guards.push(guardPass('team-worker-idle', 'No busy workers'));
    }

    if (opts.pendingReplay) {
        guards.push(guardBlock('team-pending-replay', 'Worker results pending replay'));
    } else {
        guards.push(guardPass('team-no-replay', 'No pending replays'));
    }

    if (WRITE_MODES.includes(opts.plan.mode)) {
        const overlap = hasOverlappingScopes(opts.plan);
        if (overlap.overlap) {
            guards.push(guardBlock(
                'team-scope-overlap',
                `Overlapping file scopes: ${overlap.files.join(', ')}`,
            ));
        } else if (opts.plan.lanes.some(l => l.scope.length === 0)) {
            guards.push(guardBlock('team-scope-unknown', 'Write mode requires explicit file scopes'));
        } else {
            guards.push(guardPass('team-scope-ok', 'File scopes are disjoint'));
        }
    }

    if (opts.plan.lanes.length > 4) {
        guards.push(guardBlock('team-size', `Team size ${opts.plan.lanes.length} exceeds max 4`));
    } else {
        guards.push(guardPass('team-size-ok', `Team size ${opts.plan.lanes.length} within limit`));
    }

    return guards;
}
