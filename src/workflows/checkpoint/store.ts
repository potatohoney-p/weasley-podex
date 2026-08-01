// Checkpoint creation and retrieval — SDK-free.
// Pre-write snapshots for workflow commands.

import crypto from 'node:crypto';
import type { WorkflowCheckpoint, CheckpointRecord } from './types.js';

const checkpoints = new Map<string, CheckpointRecord>();

export function createCheckpoint(opts: {
    workflowId: string;
    reason: string;
    files: string[];
    gitRef?: string;
}): WorkflowCheckpoint {
    const checkpointId = `ckpt-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const checkpoint: WorkflowCheckpoint = {
        checkpointId,
        workflowId: opts.workflowId,
        createdAt: new Date().toISOString(),
        reason: opts.reason,
        files: opts.files,
        gitRef: opts.gitRef,
        restoreAvailable: !!opts.gitRef,
    };

    checkpoints.set(checkpointId, { checkpoint, metadata: {} });
    return checkpoint;
}

export function getCheckpoint(checkpointId: string): CheckpointRecord | null {
    return checkpoints.get(checkpointId) ?? null;
}

export function listCheckpoints(workflowId?: string): WorkflowCheckpoint[] {
    const all = [...checkpoints.values()].map(r => r.checkpoint);
    if (!workflowId) return all;
    return all.filter(c => c.workflowId === workflowId);
}

export function clearCheckpoints(): void {
    checkpoints.clear();
}
