import test from 'node:test';
import assert from 'node:assert/strict';
import {
    isThinkingEntry,
    sanitizeWorkerProgressTools,
} from '../../src/orchestrator/worker-progress.ts';

test('worker progress sanitizer unwraps shell commands and caps detail preview', () => {
    const tools = sanitizeWorkerProgressTools([{
        icon: '⚡',
        label: '/bin/zsh -lc "npm run typecheck"',
        detail: '/bin/zsh -lc "npm run typecheck"',
        toolType: 'tool',
        status: 'done',
    }, {
        icon: '🔧',
        label: 'Read',
        detail: 'x'.repeat(500),
        toolType: 'tool',
    }]);

    assert.equal(tools[0]!.label, 'npm run typecheck');
    assert.equal(tools[0]!.detail, 'npm run typecheck');
    assert.ok((tools[1]!.detail || '').length <= 240);
});

test('worker progress sanitizer drops thinking entries and details', () => {
    const tools = sanitizeWorkerProgressTools([{
        icon: '💭',
        label: 'private reasoning',
        detail: 'raw hidden reasoning',
        toolType: 'thinking',
    }, {
        icon: '🔧',
        label: 'Read path',
        detail: 'Read path',
        toolType: 'tool',
    }]);

    assert.equal(tools.length, 1);
    assert.equal(tools[0]!.label, 'Read path');
    assert.equal(JSON.stringify(tools).includes('raw hidden reasoning'), false);
});

test('thinking detection catches common reasoning shapes', () => {
    assert.equal(isThinkingEntry({ icon: '💭', label: 'Plan', toolType: 'tool' }), true);
    assert.equal(isThinkingEntry({ icon: '🔧', label: 'reasoning summary', toolType: 'tool' }), true);
    assert.equal(isThinkingEntry({ icon: '🔧', label: 'Read path', toolType: 'tool' }), false);
});
