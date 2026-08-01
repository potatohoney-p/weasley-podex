// Workflow checkpoint metadata — SDK-free.
// Records pre-write checkpoint state before mutations.

export interface WorkflowCheckpoint {
    checkpointId: string;
    workflowId: string;
    createdAt: string;
    reason: string;
    files: string[];
    gitRef?: string | undefined;
    restoreAvailable: boolean;
}

export interface CheckpointRecord {
    checkpoint: WorkflowCheckpoint;
    metadata: Record<string, unknown>;
}
