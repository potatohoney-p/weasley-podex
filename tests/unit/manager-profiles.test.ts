import assert from 'node:assert/strict';
import { homedir } from 'node:os';
import { join, sep } from 'node:path';
import test from 'node:test';
import {
    deriveProfile,
    deriveProfileId,
    deriveProfiles,
    filterByProfile,
    mergeProfiles,
} from '../../src/manager/profiles.js';
import type { DashboardInstance } from '../../src/manager/types.js';

const DEFAULT_HOME = join(homedir(), '.weasley', 'podex');
const WORK_HOME = join(homedir(), 'work');
const SCHOOL_HOME = join(homedir(), 'school');

function makeInstance(port: number, homeDisplay: string): DashboardInstance {
    return {
        port,
        url: `http://localhost:${port}`,
        status: 'online',
        ok: true,
        version: '1.0.0',
        uptime: 10,
        instanceId: null,
        homeDisplay,
        workingDir: null,
        currentCli: 'codex',
        currentModel: 'gpt-5',
        serviceMode: 'manager',
        lastCheckedAt: '2026-04-28T00:00:00.000Z',
        healthReason: null,
    };
}

test('manager profiles derive stable ids from canonical home paths', () => {
    const projectHome = join(homedir(), 'projects', 'work-weasley');
    assert.equal(deriveProfileId(DEFAULT_HOME), 'default');
    assert.equal(
        deriveProfileId(projectHome),
        deriveProfileId(`${projectHome}${sep}`),
    );
});

test('manager profiles attach profileId to instances and merge by home', () => {
    const first = makeInstance(3457, WORK_HOME);
    const second = makeInstance(3458, WORK_HOME);
    const derived = deriveProfiles([first, second]);

    assert.equal(derived.profiles.length, 1);
    assert.equal(derived.instances[0]?.profileId, derived.profiles[0]?.profileId);
    assert.equal(derived.profiles[0]?.preferredPort, 3458);
});

test('manager profiles preserve user overrides while merging live data', () => {
    const live = deriveProfile(makeInstance(3457, WORK_HOME));
    assert.ok(live);
    const merged = mergeProfiles([{ ...live, label: 'Work', pinned: true, notes: 'daily' }], [live]);

    assert.equal(merged[0]?.label, 'Work');
    assert.equal(merged[0]?.pinned, true);
    assert.equal(merged[0]?.notes, 'daily');
    assert.equal(merged[0]?.preferredPort, 3457);
});

test('manager profiles filter instances by active profile ids', () => {
    const first = makeInstance(3457, WORK_HOME);
    const second = makeInstance(3458, SCHOOL_HOME);
    const derived = deriveProfiles([first, second]);
    const target = derived.profiles.find(profile => profile.profileId === deriveProfileId(WORK_HOME));
    assert.ok(target);

    assert.deepEqual(filterByProfile(derived.instances, [target.profileId]).map(row => row.port), [3457]);
    assert.deepEqual(filterByProfile(derived.instances, []).map(row => row.port), [3457, 3458]);
});

