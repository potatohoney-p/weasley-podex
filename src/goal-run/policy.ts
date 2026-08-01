import type { GoalRunSafetyGate, GoalRunBudget } from './types.js';

export function checkPreflightGates(ctx: {
    hasGoal: boolean;
    orcState: string;
    workerBusy: boolean;
    pendingReplay: boolean;
}): GoalRunSafetyGate[] {
    const gates: GoalRunSafetyGate[] = [];

    gates.push({
        gate: 'active-goal',
        passed: ctx.hasGoal,
        reason: ctx.hasGoal ? undefined : 'No active goal. Use /goal set <objective> first.',
    });

    gates.push({
        gate: 'idle-state',
        passed: ctx.orcState === 'IDLE',
        reason: ctx.orcState === 'IDLE' ? undefined : `PABCD is in ${ctx.orcState} phase. Reset or complete it first.`,
    });

    gates.push({
        gate: 'no-busy-worker',
        passed: !ctx.workerBusy,
        reason: ctx.workerBusy ? 'An employee is currently busy.' : undefined,
    });

    gates.push({
        gate: 'no-pending-replay',
        passed: !ctx.pendingReplay,
        reason: ctx.pendingReplay ? 'Pending worker results exist.' : undefined,
    });

    return gates;
}

export function allGatesPassed(gates: GoalRunSafetyGate[]): boolean {
    return gates.every(g => g.passed);
}

export function checkBudget(budget: GoalRunBudget): GoalRunSafetyGate {
    const overTurns = budget.turnsUsed >= budget.maxTurns;
    const overMinutes = budget.minutesUsed >= budget.maxMinutes;
    const overDispatches = budget.dispatchesUsed >= budget.maxDispatches;
    const exceeded = overTurns || overMinutes || overDispatches;
    const reasons: string[] = [];
    if (overTurns) reasons.push(`turns: ${budget.turnsUsed}/${budget.maxTurns}`);
    if (overMinutes) reasons.push(`minutes: ${budget.minutesUsed}/${budget.maxMinutes}`);
    if (overDispatches) reasons.push(`dispatches: ${budget.dispatchesUsed}/${budget.maxDispatches}`);
    return {
        gate: 'budget',
        passed: !exceeded,
        reason: exceeded ? `Budget exceeded: ${reasons.join(', ')}` : undefined,
    };
}
