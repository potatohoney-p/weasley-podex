// Common workflow layer types — SDK-free local contracts.
// Do NOT import provider SDKs (openai, @anthropic-ai/sdk, ai, @ai-sdk/*).

import type { OrcStateName } from '../orchestrator/state-machine.js';

export type WorkflowRisk = 'low' | 'medium' | 'high' | 'critical';
export type WorkflowOutput = 'prompt' | 'plan' | 'dispatch' | 'state' | 'report';
export type WorkflowSource = 'web' | 'terminal' | 'heartbeat' | 'employee';

export interface WorkflowRunContext {
    repoRoot: string | null;
    source: WorkflowSource;
    orcState: OrcStateName;
    worklogPath?: string | undefined;
    goalId?: string | undefined;
    traceRunId?: string | undefined;
}

export interface WorkflowGuardResult {
    ok: boolean;
    code: string;
    message: string;
    severity: 'info' | 'warn' | 'block';
}

export interface WorkflowSubcommandMeta {
    name: string;
    args?: string | undefined;
    risk: WorkflowRisk;
    output: WorkflowOutput;
    destructive?: boolean | undefined;
    requiresConfirmation?: boolean | undefined;
    jsonStatus?: boolean | undefined;
}

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

export interface WorkflowEvent {
    schemaVersion: 'workflow-event-v1';
    workflowId: string;
    sequenceId: number;
    createdAt: string;
    kind: WorkflowEventKind;
    status: WorkflowEventStatus;
    label: string;
    detail?: unknown;
}

export interface WorkflowCommandEnvelope {
    ok: boolean;
    code: string;
    message?: string | undefined;
    traceId?: string | undefined;
    data?: unknown;
    schemaVersion: 'workflow-command.v1';
}

export interface WorkflowStatusV1 {
    workflow: 'goal' | 'goal-run' | 'team';
    id: string | null;
    state: string;
    phase?: OrcStateName | undefined;
    updatedAt: string;
    heartbeatAt?: string | null | undefined;
    blockers?: Array<{ code: string; message: string }> | undefined;
    confirmationRequired?: boolean | undefined;
}

export type WorkflowHandoffMode = 'read-only' | 'verification' | 'advisory';

export interface WorkflowHandoff {
    projectRoot: string;
    mode: WorkflowHandoffMode;
    phase: OrcStateName;
    taskBody: string;
    verdictTokens: string[];
}
