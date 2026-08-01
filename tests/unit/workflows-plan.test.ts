import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand, executeCommand } from '../../src/cli/commands.ts';
import { buildPlanCompatArtifact, formatPlanCompatText } from '../../src/workflows/plan.ts';

test('/plan artifact preserves source prompt and stays non-authoritative', () => {
    const artifact = buildPlanCompatArtifact(['ship', 'phase', '2.0'], 'en', {
        projectDirs: ['/tmp/example-project'],
    });
    assert.equal(artifact.kind, 'planCompat');
    assert.equal(artifact.sourcePrompt, '/plan ship phase 2.0');
    assert.equal(artifact.lifetime, 'local-cache');
    assert.equal(artifact.durable, false);
    assert.equal(artifact.authoritative, false);
    assert.equal(artifact.storage.mode, 'jaw-home-cache');
    assert.ok(artifact.sections.some(s => s.body.includes('PABCD P')));
});

test('/plan formatted text explains PABCD P and next commands', () => {
    const artifact = buildPlanCompatArtifact(['unclear', 'request'], 'en');
    const text = formatPlanCompatText(artifact, 'en');
    assert.match(text, /PABCD P/);
    assert.match(text, /\/interview/);
    assert.match(text, /\/deliberate/);
    assert.match(text, /\/planaudit/);
    assert.match(text, /\/orchestrate P/);
});

test('/plan executes as a compatibility guide, not a new mode', async () => {
    const parsed = parseCommand('/plan add interview UX');
    const result = await executeCommand(parsed, {
        interface: 'web',
        locale: 'en',
        getSettings: () => ({ projectDirs: ['/tmp/example-project'] }),
    });
    assert.equal(result.ok, true);
    assert.equal(result.artifact?.kind, 'planCompat');
    assert.equal(result.artifact?.authoritative, false);
    assert.match(result.text, /PABCD P/);
    assert.doesNotMatch(result.text, /plan mode started/i);
});
