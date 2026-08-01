// Shared guard functions used by /goal, /goal run, heartbeat, and /team.
// Does NOT import provider SDKs.

import type { WorkflowGuardResult } from './types.js';
import { guardPass, guardBlock } from './guards.js';
import type { OrcStateName } from '../orchestrator/state-machine.js';

export function guardIdleState(orcState: OrcStateName): WorkflowGuardResult {
    if (orcState !== 'IDLE') {
        return guardBlock('not-idle', `PABCD state is ${orcState}, expected IDLE`);
    }
    return guardPass('idle', 'PABCD is IDLE');
}

export function guardNoActiveWorkers(activeWorkers: number): WorkflowGuardResult {
    if (activeWorkers > 0) {
        return guardBlock('workers-busy', `${activeWorkers} worker(s) still active`);
    }
    return guardPass('no-workers', 'No active workers');
}

export function guardNoPendingReplay(hasPending: boolean): WorkflowGuardResult {
    if (hasPending) {
        return guardBlock('pending-replay', 'Worker results pending replay');
    }
    return guardPass('no-replay', 'No pending replays');
}

export function guardHasGoal(goalId: string | null): WorkflowGuardResult {
    if (!goalId) {
        return guardBlock('no-goal', 'No active goal set');
    }
    return guardPass('has-goal', 'Active goal exists');
}

export function guardBudgetRemaining(opts: {
    maxTurns: number;
    turnsUsed: number;
    maxMinutes: number;
    minutesUsed: number;
    maxDispatches: number;
    dispatchesUsed: number;
}): WorkflowGuardResult {
    if (opts.turnsUsed >= opts.maxTurns) {
        return guardBlock('budget-turns', `Turn budget exhausted: ${opts.turnsUsed}/${opts.maxTurns}`);
    }
    if (opts.minutesUsed >= opts.maxMinutes) {
        return guardBlock('budget-minutes', `Time budget exhausted: ${opts.minutesUsed}/${opts.maxMinutes} min`);
    }
    if (opts.dispatchesUsed >= opts.maxDispatches) {
        return guardBlock('budget-dispatches', `Dispatch budget exhausted: ${opts.dispatchesUsed}/${opts.maxDispatches}`);
    }
    return guardPass('budget-ok', 'Budget within limits');
}

export function guardNoForce(forceRequested: boolean): WorkflowGuardResult {
    if (forceRequested) {
        return guardBlock('force-forbidden', 'Goal-run must never use force');
    }
    return guardPass('no-force', 'No force requested');
}
