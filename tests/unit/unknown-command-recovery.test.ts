import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCommand, executeCommand } from '../../src/cli/commands.ts';

test('unknown slash command preserves original prompt and suggestions', async () => {
    const parsed = parseCommand('/plna 아주 긴 계획 요청');
    const result = await executeCommand(parsed, {
        interface: 'web',
        locale: 'ko',
        getSettings: () => ({ projectDirs: ['/tmp/example-project'] }),
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'unknown_command');
    assert.equal(result.recovery?.originalText, '/plna 아주 긴 계획 요청');
    assert.equal(result.artifact?.kind, 'unknownCommandRecovery');
    assert.equal(result.artifact?.sourcePrompt, '/plna 아주 긴 계획 요청');
    assert.ok(result.recovery?.suggestedCommands?.some(c => c === '/plan'));
});

test('web chat source renders unknown command recovery controls', () => {
    const src = readFileSync(new URL('../../public/js/features/chat.ts', import.meta.url), 'utf8');
    assert.match(src, /renderCommandRecovery/);
    assert.match(src, /data-cmd-recovery-action="reinsert"/);
    assert.match(src, /data-cmd-recovery-action="copy"/);
    assert.match(src, /cmd-recovery-text/);
});

test('web chat css defines compact command recovery block', () => {
    const src = readFileSync(new URL('../../public/css/chat.css', import.meta.url), 'utf8');
    assert.match(src, /\.cmd-recovery\b/);
    assert.match(src, /\.cmd-recovery-text\b/);
    assert.match(src, /\.cmd-recovery-actions\b/);
});
