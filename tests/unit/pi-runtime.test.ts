import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildPiModelsConfig,
    normalizePiEndpoint,
    normalizePiProfile,
    parsePiModelList,
    parsePiRpcRecord,
    resolvePiCommand,
} from '../../src/agent/pi-runtime.ts';

test('Pi endpoint normalization infers OpenAI chat completions suffix', () => {
    const normalized = normalizePiEndpoint('http://127.0.0.1:18645/v1/chat/completions');
    assert.deepEqual(normalized, {
        baseUrl: 'http://127.0.0.1:18645/v1',
        inferredApiKind: 'openai-completions',
    });
});

test('Pi endpoint normalization infers responses and messages suffixes', () => {
    assert.equal(normalizePiEndpoint('https://api.example.com/v1/responses').inferredApiKind, 'openai-responses');
    assert.equal(normalizePiEndpoint('https://api.example.com/v1/messages').inferredApiKind, 'anthropic-messages');
});

test('Pi basic local proxy accepts empty API key and stores dummy', () => {
    const profile = normalizePiProfile({
        id: 'progrok',
        mode: 'basic',
        endpoint: 'http://localhost:18645/v1',
        model: 'grok-composer-2.5-fast',
        apiKey: '',
    });
    assert.equal(profile.apiKey, 'dummy');
});

test('Pi remote profile requires an API key', () => {
    assert.throws(() => normalizePiProfile({
        id: 'remote',
        mode: 'basic',
        endpoint: 'https://api.example.com/v1',
        model: 'm',
        apiKey: '',
    }), /api key required/);
});

test('Pi models.json config includes provider profile and selected model', () => {
    const profile = normalizePiProfile({
        id: 'progrok',
        endpoint: 'http://127.0.0.1:18645/v1',
        model: 'grok-4.3',
    });
    const config = buildPiModelsConfig({ defaultProfileId: 'progrok', profiles: [profile] });
    const provider = ((config.providers as Record<string, unknown>).progrok as Record<string, unknown>);
    assert.deepEqual((provider.models as Array<Record<string, unknown>>).map((entry) => entry.id), ['grok-4.3']);
    assert.equal(provider.api, 'openai-completions');
});

test('Pi offline model list parser extracts models for the selected provider', () => {
    const output = `provider model context\nprogrok grok-4.3 256000\nprogrok grok-composer-2.5-fast 256000\nother x 1\n`;
    assert.deepEqual(parsePiModelList(output, 'progrok'), ['grok-4.3', 'grok-composer-2.5-fast']);
});

test('Pi RPC parser treats prompt success as non-terminal and agent_end as done', () => {
    assert.deepEqual(parsePiRpcRecord({ id: 1, type: 'response', command: 'prompt', success: true }), {});
    assert.deepEqual(parsePiRpcRecord({ type: 'agent_end', sessionId: 's1' }), { done: true, sessionId: 's1' });
    assert.deepEqual(parsePiRpcRecord({
        type: 'agent_end',
        messages: [
            { role: 'user', content: [{ type: 'text', text: 'prompt' }] },
            { role: 'assistant', content: [{ type: 'text', text: 'answer' }] },
        ],
    }), { done: true, text: 'answer' });
});

test('Pi RPC parser extracts thinking_delta as thinking, not text', () => {
    const event = parsePiRpcRecord({
        type: 'message_update',
        assistantMessageEvent: { type: 'thinking_delta', contentIndex: 0, delta: 'reasoning here' },
    });
    assert.deepEqual(event, { thinking: 'reasoning here' });
    assert.equal(event.text, undefined);
});

test('Pi RPC parser extracts text_delta as text', () => {
    const event = parsePiRpcRecord({
        type: 'message_update',
        assistantMessageEvent: { type: 'text_delta', contentIndex: 1, delta: 'Hello!' },
    });
    assert.deepEqual(event, { text: 'Hello!' });
    assert.equal(event.thinking, undefined);
});

test('Pi RPC parser ignores thinking_start/end and text_start/end boundaries', () => {
    assert.deepEqual(parsePiRpcRecord({
        type: 'message_update',
        assistantMessageEvent: { type: 'thinking_start', contentIndex: 0 },
    }), {});
    assert.deepEqual(parsePiRpcRecord({
        type: 'message_update',
        assistantMessageEvent: { type: 'text_end', contentIndex: 1, content: 'Hello!' },
    }), {});
});

test('Pi RPC parser filters thinking from agent_end messages', () => {
    const event = parsePiRpcRecord({
        type: 'agent_end',
        messages: [
            { role: 'user', content: [{ type: 'text', text: 'hi' }] },
            {
                role: 'assistant',
                content: [
                    { type: 'thinking', thinking: 'internal reasoning', thinkingSignature: 'reasoning_content' },
                    { type: 'text', text: 'Hello!' },
                ],
            },
        ],
    });
    assert.equal(event.done, true);
    assert.equal(event.text, 'Hello!');
    assert.ok(!event.text?.includes('internal reasoning'));
});

test('Pi RPC parser extracts sessionId from get_state response data', () => {
    const event = parsePiRpcRecord({
        id: 1, type: 'response', command: 'get_state', success: true,
        data: { sessionId: 'abc-123', model: { id: 'test' } },
    });
    assert.equal(event.sessionId, 'abc-123');
});

test('Pi RPC parser: only tool_execution_end emits tool entry (1 per call)', () => {
    const start = parsePiRpcRecord({
        type: 'tool_execution_start',
        toolCallId: 'call-abc',
        toolName: 'bash',
        args: { command: 'ls /tmp' },
    });
    assert.deepEqual(start, {});

    const update = parsePiRpcRecord({
        type: 'tool_execution_update',
        toolCallId: 'call-abc',
        toolName: 'bash',
        args: { command: 'ls /tmp' },
        partialResult: { content: [] },
    });
    assert.deepEqual(update, {});

    const end = parsePiRpcRecord({
        type: 'tool_execution_end',
        toolCallId: 'call-abc',
        toolName: 'bash',
        args: { command: 'ls /tmp' },
        result: { content: [{ type: 'text', text: 'file1.txt\nfile2.txt' }] },
        isError: false,
    });
    assert.equal(end.tool?.label, 'bash');
    assert.equal(end.tool?.status, 'done');
    assert.ok(end.tool?.detail?.includes('ls /tmp'));
    assert.ok(end.tool?.detail?.includes('file1.txt'));
});

test('Pi RPC parser: toolcall_start/end both dropped (no tool entry)', () => {
    const start = parsePiRpcRecord({
        type: 'message_update',
        assistantMessageEvent: {
            type: 'toolcall_start',
            contentIndex: 1,
            partial: {
                role: 'assistant',
                content: [
                    { type: 'toolCall', name: 'bash', arguments: { command: 'echo hi' } },
                ],
            },
        },
    });
    assert.deepEqual(start, {});

    const end = parsePiRpcRecord({
        type: 'message_update',
        assistantMessageEvent: {
            type: 'toolcall_end',
            contentIndex: 1,
            toolCall: { type: 'toolCall', name: 'grep', arguments: { pattern: 'foo' } },
        },
    });
    assert.deepEqual(end, {});
});

test('Pi RPC parser toolcall_delta returns empty (no text leak)', () => {
    const delta = parsePiRpcRecord({
        type: 'message_update',
        assistantMessageEvent: {
            type: 'toolcall_delta',
            contentIndex: 1,
            delta: '{"command":"ls"}',
        },
    });
    assert.deepEqual(delta, {});
    assert.equal(delta.text, undefined);
    assert.equal((delta as any).thinking, undefined);
});

test('Pi command fallback is command/baseArgs tuple, not a shell string', () => {
    const cmd = resolvePiCommand({ PATH: '' });
    assert.equal(cmd.command, 'npm');
    assert.deepEqual(cmd.baseArgs.slice(0, 4), ['exec', '--yes', '--package', '@earendil-works/pi-coding-agent']);
});
