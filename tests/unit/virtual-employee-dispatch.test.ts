import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
    buildVirtualEmployeeRow,
    findVirtualRolePreset,
    isVirtualEmployeeId,
    VIRTUAL_EMPLOYEE_ID_PREFIX,
    VIRTUAL_ROLE_PRESETS,
} from '../../src/core/employees.ts';
import { ROLE_PRESETS } from '../../public/js/constants.ts';

const projectRoot = join(import.meta.dirname, '../..');
const distributeSrc = readFileSync(join(projectRoot, 'src/orchestrator/distribute.ts'), 'utf8');

test('virtual employee builder creates ephemeral synthetic rows from role presets', () => {
    const row = buildVirtualEmployeeRow(
        { name: 'security' },
        { cli: 'claude', model: 'claude-fable-5' },
    );

    assert.ok(isVirtualEmployeeId(row.id), 'virtual worker id should use virtual prefix');
    assert.ok(row.id.startsWith(`${VIRTUAL_EMPLOYEE_ID_PREFIX}security:`));
    assert.equal(row.name, 'Virtual:security');
    assert.equal(row.cli, 'claude');
    assert.equal(row.model, 'claude-fable-5');
    assert.equal(row.status, 'idle');
    assert.match(row.role, /Security reviewer/);
});

test('virtual employee builder accepts freeform role and explicit cli/model overrides', () => {
    const row = buildVirtualEmployeeRow(
        {
            name: 'release-checker',
            role: 'Review release notes and deployment risk.',
            cli: 'codex',
            model: 'gpt-5.5',
        },
        { cli: 'claude', model: 'claude-fable-5' },
    );

    assert.ok(isVirtualEmployeeId(row.id));
    assert.equal(row.name, 'Virtual:release-checker');
    assert.equal(row.cli, 'codex');
    assert.equal(row.model, 'gpt-5.5');
    assert.equal(row.role, 'Review release notes and deployment risk.');
});

test('virtual employee role presets stay aligned with frontend role presets', () => {
    const frontendValues = new Map(ROLE_PRESETS.map((preset) => [preset.value, preset]));
    for (const preset of VIRTUAL_ROLE_PRESETS) {
        const frontend = frontendValues.get(preset.value);
        assert.ok(frontend, `frontend ROLE_PRESETS should include ${preset.value}`);
        assert.equal(frontend?.skill, preset.skill);
        assert.equal(frontend?.prompt, preset.role);
    }
});

test('findVirtualRolePreset resolves values and labels case-insensitively', () => {
    assert.equal(findVirtualRolePreset('testing')?.value, 'testing');
    assert.equal(findVirtualRolePreset('Security')?.value, 'security');
    assert.equal(findVirtualRolePreset('unknown'), null);
});

test('virtual employees never reuse or persist employee sessions', () => {
    assert.ok(
        distributeSrc.includes('const isVirtualEmployee = isVirtualEmployeeId(empId)'),
        'runSingleAgent should identify virtual employees from the worker id',
    );
    assert.ok(
        distributeSrc.includes('const empSession = isVirtualEmployee ? undefined : getEmployeeSession.get(empId)'),
        'virtual employees should skip employee session lookup',
    );
    assert.ok(
        distributeSrc.includes('const clearedStaleResumeKey = isVirtualEmployee ? false : clearStaleEmployeeSessionIfResumeKeyMismatch'),
        'virtual employees should skip stale resume-key clearing',
    );
    assert.ok(
        distributeSrc.includes('!isVirtualEmployee\n        && isSessionPersistingCli'),
        'virtual employees should never enter the resume path',
    );
    assert.ok(
        distributeSrc.includes('!isVirtualEmployee && isSuccess && r["sessionId"] && isSessionPersistingCli'),
        'virtual employees should never persist employee sessions',
    );
    assert.ok(
        distributeSrc.includes('!isVirtualEmployee && !isSessionPersistingCli'),
        'virtual employees should not clear durable employee session rows either',
    );
});
