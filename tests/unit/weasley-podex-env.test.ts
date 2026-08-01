import assert from 'node:assert/strict';
import test from 'node:test';
import {
    deleteWeasleyPodexEnv,
    getWeasleyPodexEnv,
    hasWeasleyPodexEnv,
    setWeasleyPodexEnv,
    weasleyPodexEnvName,
} from '../../src/core/weasley-podex-env.ts';

test('canonical environment name uses the Weasley Podex prefix', () => {
    assert.equal(weasleyPodexEnvName('HOME'), 'WEASLEY_PODEX_HOME');
});

test('primary environment value wins over historical prefix fallbacks', () => {
    const env = {
        WEASLEY_PODEX_SAMPLE: 'primary',
        JAW_SAMPLE: 'older',
        podex_SAMPLE: 'oldest',
    };
    assert.equal(getWeasleyPodexEnv('SAMPLE', env), 'primary');
});

test('historical prefixes are read only through the compatibility helper', () => {
    assert.equal(getWeasleyPodexEnv('SAMPLE', { JAW_SAMPLE: 'older' }), 'older');
    assert.equal(getWeasleyPodexEnv('SAMPLE', { podex_SAMPLE: 'oldest' }), 'oldest');
});

test('set and delete mutate only the canonical environment name', () => {
    const env: Record<string, string | undefined> = { JAW_SAMPLE: 'legacy' };
    setWeasleyPodexEnv('SAMPLE', 'primary', env);
    assert.equal(hasWeasleyPodexEnv('SAMPLE', env), true);
    assert.equal(env.WEASLEY_PODEX_SAMPLE, 'primary');
    assert.equal(env.JAW_SAMPLE, 'legacy');
    deleteWeasleyPodexEnv('SAMPLE', env);
    assert.equal(env.WEASLEY_PODEX_SAMPLE, undefined);
    assert.equal(getWeasleyPodexEnv('SAMPLE', env), 'legacy');
});
