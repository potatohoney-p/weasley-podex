import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultPreviewFromForManagerPort as managerPreviewFrom } from '../../src/manager/preview-ports.js';
import {
    defaultPreviewFromForManagerPort as electronPreviewFrom,
    previewSpawnEnvForManager,
    resolvePreviewFramePolicyForManager,
} from '../../electron/src/main/lib/preview-ports.js';

test('dashboard preview ranges are isolated per manager port', () => {
    assert.equal(managerPreviewFrom(24576), 24602);
    assert.equal(managerPreviewFrom(24577), 24702);
    assert.equal(managerPreviewFrom(24578), 24802);

    assert.equal(electronPreviewFrom(24576), 24602);
    assert.equal(electronPreviewFrom(24577), 24702);
    assert.equal(electronPreviewFrom(24578), 24802);
});

test('electron spawned dashboard exports the manager-specific preview range', () => {
    const env = previewSpawnEnvForManager(24577, {});
    assert.equal(env.DASHBOARD_PREVIEW_FROM, '24702');

    const policy = resolvePreviewFramePolicyForManager(24577, {});
    assert.equal(policy.previewFrom, 24702);
    assert.equal(policy.previewCount, 50);
});

test('explicit preview env overrides manager-port derived range', () => {
    const policy = resolvePreviewFramePolicyForManager(24577, {
        DASHBOARD_PREVIEW_FROM: '26002',
        DASHBOARD_SCAN_COUNT: '12',
    });
    assert.equal(policy.previewFrom, 26002);
    assert.equal(policy.previewCount, 12);
});
