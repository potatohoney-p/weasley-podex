import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..', '..');

function read(path: string): string {
    return readFileSync(join(root, path), 'utf8');
}

test('Electron exposes worktree-specific root registration instead of generic root registration', () => {
    const folderIpc = read('electron/src/main/lib/folder/ipc.ts');
    const preload = read('electron/src/preload/index.ts');
    const bridge = read('public/manager/src/panels/desktop-bridge.ts');
    const sources = read('public/manager/src/folder-panel/folder-sources.ts');

    assert.ok(folderIpc.includes("ipcMain.handle('folder:registerGitWorktreeRoot'"), 'folder IPC must expose a worktree-specific registration handler');
    assert.equal(folderIpc.includes("ipcMain.handle('folder:registerRoot'"), false, 'folder IPC must not expose generic registerRoot');
    assert.ok(folderIpc.includes('resolveFolderGitRoot(folderPanelRoot, repoRoot)'), 'registration must validate the originating FolderPanel repo');
    assert.ok(folderIpc.includes('getGitWorktrees(resolved.repoRoot)'), 'registration must verify the target against the repo worktree list');
    assert.ok(folderIpc.includes('allowed.includes(targetReal)'), 'registration must compare normalized worktree paths before opening access');
    assert.ok(preload.includes("ipcRenderer.invoke('folder:registerGitWorktreeRoot'"), 'preload must expose the worktree-specific registration bridge');
    assert.ok(bridge.includes('registerGitWorktreeRoot?:'), 'desktop bridge must type the worktree registration method');
    assert.ok(sources.includes('registerGitWorktreeRoot: async'), 'Electron folder source must map worktree registration through the bridge');
});

test('Electron git bridge exposes read-only worktree listing', () => {
    const gitIpc = read('electron/src/main/lib/git/ipc.ts');
    const preload = read('electron/src/preload/index.ts');
    const bridge = read('public/manager/src/panels/desktop-bridge.ts');

    assert.ok(gitIpc.includes("ipcMain.handle('git:getWorktrees'"), 'git IPC must expose worktree listing');
    assert.ok(gitIpc.includes('getGitWorktrees(resolved.repoRoot)'), 'git IPC must call the read-only worktree service');
    assert.ok(preload.includes("ipcRenderer.invoke('git:getWorktrees'"), 'preload must expose git:getWorktrees');
    assert.ok(bridge.includes('getWorktrees:'), 'desktop git bridge must type getWorktrees');
});
