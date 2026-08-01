import test from 'node:test';
import assert from 'node:assert/strict';
import { broadcast, inferTopic, clearAllBroadcastListeners } from '../../src/core/bus.ts';
import { subscribe, type BusEvent } from '../../src/core/event-bus.ts';

// Isolate the listener side so only the SSE emit path is observed.
clearAllBroadcastListeners();

test('inferTopic routes claude-e traces to trace BEFORE the agent prefix', () => {
    assert.equal(inferTopic('agent:claude-e:runtime_started'), 'trace');
    assert.equal(inferTopic('agent:claude-e:error'), 'trace');
});

test('inferTopic routes agents CRUD before the generic agent_ prefix', () => {
    assert.equal(inferTopic('agent_added'), 'agents');
    assert.equal(inferTopic('agent_updated'), 'agents');
    assert.equal(inferTopic('agent_deleted'), 'agents');
    assert.equal(inferTopic('agent_done'), 'agent');
    assert.equal(inferTopic('agent_status'), 'agent');
    assert.equal(inferTopic('steer_started'), 'agent');
});

test('inferTopic covers the remaining topic families', () => {
    assert.equal(inferTopic('orc_state'), 'orchestrate');
    assert.equal(inferTopic('orchestrate_done'), 'orchestrate');
    assert.equal(inferTopic('goal_done'), 'goal');
    assert.equal(inferTopic('workflow_event'), 'workflow');
    assert.equal(inferTopic('memory_status'), 'memory');
    assert.equal(inferTopic('worker_stalled'), 'worker');
    assert.equal(inferTopic('new_message'), 'message');
    assert.equal(inferTopic('queue_update'), 'queue');
    assert.equal(inferTopic('heartbeat_pending'), 'heartbeat');
    assert.equal(inferTopic('schedule_wakeup'), 'schedule');
    assert.equal(inferTopic('clear'), 'session');
    assert.equal(inferTopic('session_reset'), 'session');
    assert.equal(inferTopic('settings_change'), 'settings');
    assert.equal(inferTopic('system_notice'), 'system');
    assert.equal(inferTopic('totally_unknown_type'), 'system');
});

test('broadcast dual-emits public events to the SSE event-bus', () => {
    const got: BusEvent[] = [];
    const unsub = subscribe(e => { got.push(e); });
    broadcast('queue_update', { pending: 3 });
    unsub();
    assert.equal(got.length, 1);
    assert.equal(got[0]!.topic, 'queue');
    assert.equal(got[0]!.event, 'queue_update');
    assert.equal(got[0]!.data['pending'], 3);
});

test('broadcast audience gate: internal events never reach the SSE event-bus', () => {
    const got: BusEvent[] = [];
    const unsub = subscribe(e => { got.push(e); });
    broadcast('agent:claude-e:runtime_started', { runId: 'x' }, 'internal');
    broadcast('agent_done', { text: 'hi' }, 'internal');
    unsub();
    assert.equal(got.length, 0);
});

test('broadcast sanitizes agent_tool payloads before SSE publish', () => {
    const got: BusEvent[] = [];
    const unsub = subscribe(e => { got.push(e); });
    broadcast('agent_tool', { tool: 'Bash', label: 'ls' });
    unsub();
    assert.equal(got.length, 1);
    assert.equal(got[0]!.topic, 'agent');
    // sanitizeBroadcastData merges sanitizeToolLogEntry output — shape only.
    assert.equal(typeof got[0]!.data, 'object');
});
