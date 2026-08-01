import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { executeCommand, parseCommand } from '../../src/cli/commands.ts';

const overlaysSource = readFileSync(new URL('../../bin/commands/tui/overlays.ts', import.meta.url), 'utf8');
const slashRunnerSource = readFileSync(new URL('../../bin/commands/tui/slash-command-runner.ts', import.meta.url), 'utf8');
const inputHandlerSource = readFileSync(new URL('../../bin/commands/tui/input-handler.ts', import.meta.url), 'utf8');

test('fullscreen /quit remains a CLI command that returns exit code', async () => {
    const parsed = parseCommand('/quit');

    assert.equal(parsed?.type, 'known');
    assert.equal(parsed?.name, 'quit');

    const result = await executeCommand(parsed, { interface: 'cli' });
    assert.equal(result?.ok, true);
    assert.equal(result?.code, 'exit');
});

test('fullscreen runSlashCommand keeps terminal cleanup before process exit', () => {
    assert.match(slashRunnerSource, /export async function runSlashCommand/);
    assert.match(slashRunnerSource, /result\?\.code === 'exit'/);
    assert.match(slashRunnerSource, /cleanupScrollRegion/);
    assert.match(slashRunnerSource, /setBracketedPaste\(false\)/);
    assert.match(slashRunnerSource, /process\.stdin\.setRawMode\(false\)/);
    assert.match(slashRunnerSource, /process\.exit\(0\)/);
});

test('fullscreen input handler parses slash drafts before normal chat send', () => {
    const parseIndex = inputHandlerSource.indexOf('const parsed = draft !== null ? parseCommand(text) : null;');
    const commandIndex = inputHandlerSource.indexOf('void runSlashCommand(ctx, parsed);');
    const sendIndex = inputHandlerSource.indexOf("ctx.ws.send(JSON.stringify({ type: 'send_message', text }));");

    assert.ok(parseIndex >= 0, 'slash draft parse should exist');
    assert.ok(commandIndex > parseIndex, 'runSlashCommand should follow slash parsing');
    assert.ok(sendIndex > commandIndex, 'normal chat send should remain after slash command branch');
});

test('autocomplete enter ignores selected command when it no longer matches current slash query', () => {
    assert.match(inputHandlerSource, /const currentDraft = getPlainCommandDraft\(composer\);/);
    assert.ok(inputHandlerSource.includes("const commandQuery = currentDraft?.startsWith('/')"));
    assert.match(inputHandlerSource, /!picked\.name\.toLowerCase\(\)\.startsWith\(commandQuery\)/);
});

test('autocomplete redraw ignores stale async slash results', () => {
    const overlaysSource = readFileSync(new URL('../../bin/commands/tui/overlays.ts', import.meta.url), 'utf8');

    assert.match(overlaysSource, /let autocompleteRedrawSeq = 0;/);
    assert.match(overlaysSource, /const requestSeq = \+\+autocompleteRedrawSeq;/);
    assert.match(overlaysSource, /if \(requestSeq !== autocompleteRedrawSeq\) return;/);
});
