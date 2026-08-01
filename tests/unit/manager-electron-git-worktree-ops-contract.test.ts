import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..', '..');

function read(path: string): string {
    return readFileSync(join(root, path), 'utf8');
}

test('Electron git IPC exposes preview and confirmed worktree operation handlers', () => {
    const ipc = read('electron/src/main/lib/git/ipc.ts');

    assert.ok(ipc.includes("ipcMain.handle('git:previewWorktreeOperation'"), 'git IPC must expose preview handler');
    assert.ok(ipc.includes("ipcMain.handle('git:runWorktreeOperation'"), 'git IPC must expose run handler');
    assert.ok(ipc.includes('readGitWorktreeOperation(rawOperation)'), 'IPC handlers must parse raw operations');
    assert.ok(ipc.includes('validateGitWorktreeOperationPreviewContext'), 'preview IPC must validate FolderPanel context');
    assert.ok(ipc.includes('confirmed !== true'), 'run IPC must require explicit confirmation');
    assert.ok(ipc.includes('runGitWorktreeOperation(resolved.repoRoot, operation)'), 'run IPC must call typed operation service');
});

test('Electron preload and desktop bridge keep worktree operation signatures aligned', () => {
    const preload = read('electron/src/preload/index.ts');
    const bridge = read('public/manager/src/panels/desktop-bridge.ts');

    assert.ok(preload.includes("ipcRenderer.invoke('git:previewWorktreeOperation', folderPanelRoot, repoRoot, operation)"), 'preload preview must pass root context');
    assert.ok(preload.includes("ipcRenderer.invoke('git:runWorktreeOperation', folderPanelRoot, repoRoot, operation, confirmed)"), 'preload run must pass confirmation');
    assert.ok(bridge.includes('previewWorktreeOperation: ('), 'desktop bridge must type preview operation');
    assert.ok(bridge.includes('runWorktreeOperation: ('), 'desktop bridge must type run operation');
    assert.ok(bridge.includes('GitWorktreeOperationPreview'), 'desktop bridge must expose preview type');
});
