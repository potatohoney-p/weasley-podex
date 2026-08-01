// Team orchestration types — SDK-free.
// Does NOT import provider SDKs.

export type TeamMode =
    | 'research-team'
    | 'audit-team'
    | 'verify-team'
    | 'implementation-team'
    | 'repair-team';

export type TeamState =
    | 'planned'
    | 'auditing'
    | 'collecting'
    | 'paused'
    | 'complete'
    | 'stopped'
    | 'error';

export type TeamLaneState =
    | 'planned'
    | 'running'
    | 'done'
    | 'blocked'
    | 'needs_fix';

export type TeamVerdict = 'PASS' | 'NEEDS_FIX' | 'BLOCKED';

export interface TeamLane {
    laneId: string;
    role: string;
    employee: string | null;
    mode: TeamMode;
    scope: string[];
    state: TeamLaneState;
    verdict?: TeamVerdict | undefined;
    traceRef?: string | undefined;
    elapsedMs?: number | undefined;
}

export interface TeamPlan {
    teamId: string;
    mode: TeamMode;
    request: string;
    lanes: TeamLane[];
    createdAt: string;
}

export interface TeamEvent {
    teamId: string;
    kind: 'plan' | 'dispatch' | 'result' | 'collect' | 'stop' | 'error';
    laneId?: string | undefined;
    timestamp: string;
    detail: string;
}

export interface TeamRun {
    teamId: string;
    state: TeamState;
    plan: TeamPlan;
    events: TeamEvent[];
    startedAt?: string | undefined;
    stoppedAt?: string | undefined;
    lastError?: string | undefined;
}

export const VALID_TEAM_TRANSITIONS: Record<TeamState, TeamState[]> = {
    planned: ['auditing', 'stopped'],
    auditing: ['collecting', 'paused', 'stopped', 'error'],
    collecting: ['complete', 'error'],
    paused: ['auditing', 'stopped'],
    complete: [],
    stopped: [],
    error: ['paused', 'stopped'],
};
