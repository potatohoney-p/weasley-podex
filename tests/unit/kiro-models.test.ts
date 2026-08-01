import test from 'node:test';
import assert from 'node:assert/strict';
import { parseKiroModelListJson } from '../../src/agent/kiro-models.ts';

const SAMPLE = JSON.stringify({
    default_model: 'auto',
    models: [
        {
            model_name: 'auto',
            model_id: 'auto',
            description: 'Models chosen by task',
            context_window_tokens: 1000000,
            rate_multiplier: 1.0,
            rate_unit: 'Credit',
        },
        {
            model_name: 'claude-sonnet-4.6',
            model_id: 'claude-sonnet-4.6',
            description: 'Sonnet',
            context_window_tokens: 1000000,
            rate_multiplier: 1.3,
            rate_unit: 'Credit',
        },
    ],
});

test('parseKiroModelListJson extracts model ids and default', () => {
    const inventory = parseKiroModelListJson(SAMPLE);
    assert.ok(inventory);
    assert.equal(inventory!.defaultModel, 'auto');
    assert.deepEqual(inventory!.models, ['auto', 'claude-sonnet-4.6']);
    assert.equal(inventory!.entries.length, 2);
    assert.equal(inventory!.entries[1]?.rateMultiplier, 1.3);
});

test('parseKiroModelListJson rejects invalid payloads', () => {
    assert.equal(parseKiroModelListJson('not json'), null);
    assert.equal(parseKiroModelListJson('{"models":[]}'), null);
});
