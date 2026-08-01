import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import {
    createWorkflowStorage,
    getWorkflowArtifactsRoot,
    projectKeyFromPath,
    resolveWorkflowArtifactPath,
    saveWorkflowArtifact,
} from '../../src/workflows/artifacts.ts';
import type { WorkflowArtifact } from '../../src/cli/types.ts';

test('workflow artifact path resolves inside JAW_HOME artifact root', () => {
    const root = path.resolve(getWorkflowArtifactsRoot());
    const projectKey = projectKeyFromPath('/tmp/example-project');
    const artifactPath = resolveWorkflowArtifactPath(projectKey, 'artifact-1', '2026-05-27');
    assert.ok(artifactPath.startsWith(root + path.sep));
    assert.match(artifactPath, /2026-05-27\/artifact-1\.json$/);
});

test('workflow artifact path rejects traversal outside root', () => {
    assert.throws(
        () => resolveWorkflowArtifactPath('../escape', '../../bad', '2026-05-27'),
        /escaped JAW_HOME artifact root|Invalid workflow artifact/,
    );
});

test('saveWorkflowArtifact writes non-authoritative local cache artifact', () => {
    const projectKey = projectKeyFromPath('/tmp/example-project');
    const artifact: WorkflowArtifact = {
        id: 'artifact-save-test',
        kind: 'planCompat',
        version: 1,
        title: 'Plan',
        sourcePrompt: '/plan test',
        lifetime: 'local-cache',
        durable: false,
        authoritative: false,
        storage: createWorkflowStorage(projectKey),
        sections: [{ id: 'source', title: 'Source', body: '/plan test', format: 'plain' }],
        suggestedNextActions: [],
    };
    const saved = saveWorkflowArtifact(artifact, { projectDirs: ['/tmp/example-project'] });
    assert.equal(saved.storage.mode, 'jaw-home-cache');
    assert.equal(saved.authoritative, false);
    assert.ok(saved.storage.path);
    assert.ok(existsSync(saved.storage.path));
    rmSync(saved.storage.path, { force: true });
});
