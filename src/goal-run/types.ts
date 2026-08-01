export type GoalRunMode = 'dry-run' | 'assist' | 'bounded' | 'supervised';

export interface GoalRunBudget {
    maxTurns: number;
    maxMinutes: number;
    maxDispatches: number;
    turnsUsed: number;
    minutesUsed: number;
    dispatchesUsed: number;
}

export interface GoalRunSafetyGate {
    gate: string;
    passed: boolean;
    reason?: string | undefined;
}

export interface GoalRunState {
    goalId: string;
    mode: GoalRunMode;
    status: 'preflight' | 'running' | 'paused' | 'stopped' | 'completed' | 'failed';
    budget: GoalRunBudget;
    gates: GoalRunSafetyGate[];
    startedAt?: string | undefined;
    stoppedAt?: string | undefined;
    lastActiveAt?: string | undefined;
    lastError?: string | undefined;
}

export type FailureAction = 'stop' | 'ask' | 'retry' | 'follow-up-plan';

export interface FailureDecision {
    action: FailureAction;
    reason: string;
    maxRetries?: number | undefined;
}
