import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../bin/commands/tui/ws-handler.ts', import.meta.url), 'utf8');

test('ws handler routes thinking deltas to thinking transcript rows', () => {
    assert.match(source, /normalizeTuiWsEvent\(JSON\.parse\(raw\)\)/);
    assert.match(source, /switch \(event\.kind\)/);
    assert.match(source, /const isThinkingDelta = event\.thinking/);
    assert.match(source, /if \(!isThinkingDelta\) startAssistantItem/);
    assert.match(source, /appendThinkingTurnText\(transcript, event\.text, event\.agentId\)/);
});

test('ws handler does not create line-mode stream sink for thinking deltas', () => {
    assert.match(source, /if \(!isFullscreen\(ctx\) && !isThinkingDelta\)/);
});

test('ws handler maps dto running tool state to line-mode pending renderer state', () => {
    assert.match(source, /const renderState = event\.status === 'running' \? 'pending' : event\.status/);
    assert.match(source, /renderToolLine\(event\.icon, event\.label, event\.detail, renderState\)/);
});
