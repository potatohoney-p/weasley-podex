import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pickFolderNative, type ExecImpl } from '../../src/core/folder-picker.ts';

function execReturning(stdout: string, error: (Error & { code?: number | string }) | null = null, stderr = ''): ExecImpl {
    return (_cmd, _args, cb) => { cb(error, stdout, stderr); };
}

test('FPK-001: darwin picker uses osascript choose folder and returns the path', async () => {
    let captured: { cmd: string; args: string[] } | null = null;
    const exec: ExecImpl = (cmd, args, cb) => { captured = { cmd, args }; cb(null, '/Users/jun/repo\n', ''); };
    const result = await pickFolderNative({ platform: 'darwin', execImpl: exec });
    assert.deepEqual(result, { status: 'picked', path: '/Users/jun/repo' });
    assert.equal(captured!.cmd, 'osascript');
    assert.ok(captured!.args.join(' ').includes('choose folder'), 'must open the Finder folder chooser');
});

test('FPK-002: user cancel resolves cancelled, not an error', async () => {
    const err = Object.assign(new Error('User canceled.'), { code: 1 });
    const result = await pickFolderNative({ platform: 'darwin', execImpl: execReturning('', err, 'execution error: User canceled. (-128)') });
    assert.deepEqual(result, { status: 'cancelled' });
});

test('FPK-003: concurrent calls get busy instead of stacking dialogs', async () => {
    let release: (() => void) | null = null;
    const exec: ExecImpl = (_c, _a, cb) => { release = () => cb(null, '/tmp\n', ''); };
    const first = pickFolderNative({ platform: 'darwin', execImpl: exec });
    const second = await pickFolderNative({ platform: 'darwin', execImpl: execReturning('/other\n') });
    assert.equal(second.status, 'busy');
    release!();
    assert.equal((await first).status, 'picked');
});

test('FPK-004: unsupported platform and hard failures report unavailable', async () => {
    const unsupported = await pickFolderNative({ platform: 'freebsd' as NodeJS.Platform });
    assert.equal(unsupported.status, 'unavailable');
    const err = Object.assign(new Error('spawn zenity ENOENT'), { code: 'ENOENT' });
    const failed = await pickFolderNative({ platform: 'linux', execImpl: execReturning('', err) });
    assert.equal(failed.status, 'unavailable');
});

test('FPK-005: route and UI wiring contracts', () => {
    const root = join(import.meta.dirname, '..', '..');
    const settingsSrc = readFileSync(join(root, 'src/routes/settings.ts'), 'utf8');
    assert.ok(settingsSrc.includes("app.post('/api/project/pick', requireAuth"), 'instance route must exist behind auth');
    assert.ok(settingsSrc.includes("applySettings({ projectDirs: [result.path] })"), 'picked folder must go through the settings chokepoint');
    const managerSrc = readFileSync(join(root, 'src/manager/server.ts'), 'utf8');
    assert.ok(managerSrc.includes("app.post('/api/dashboard/instances/:port/project/pick'"), 'manager proxy route must exist');
    const coreSrc = readFileSync(join(root, 'public/js/features/settings-core.ts'), 'utf8');
    assert.ok(coreSrc.includes("apiJson") && coreSrc.includes("'/api/project/pick'"), 'web UI header must call the pick endpoint');
    const headerSrc = readFileSync(join(root, 'public/manager/src/components/WorkbenchHeader.tsx'), 'utf8');
    assert.ok(headerSrc.includes('project-pick-button'), 'manager WorkbenchHeader must render the pick button');
});
