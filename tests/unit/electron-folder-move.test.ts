import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { moveFolderPath } from '../../electron/src/main/lib/folder/move-path.js';

async function withTempDir(fn: (root: string) => Promise<void>): Promise<void> {
    const root = await mkdtemp(join(tmpdir(), 'jaw-folder-move-'));
    try {
        await fn(root);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
}

function allowInside(root: string): (path: string) => boolean {
    return (path: string) => path === root || path.startsWith(root + sep);
}

test('folder move moves a file into a target directory', async () => withTempDir(async (root) => {
    const source = join(root, 'note.md');
    const target = join(root, 'Target');
    await writeFile(source, '# note');
    await mkdir(target);

    const result = await moveFolderPath(source, target, { allowPath: allowInside(root), allowDestinationPath: allowInside(root) });

    assert.equal(result.ok, true);
    assert.equal(result.ok ? result.moved.to : '', join(target, 'note.md'));
    assert.equal(result.ok ? result.moved.kind : '', 'file');
}));

test('folder move moves a folder into a sibling directory', async () => withTempDir(async (root) => {
    const source = join(root, 'Source');
    const target = join(root, 'Target');
    await mkdir(source);
    await mkdir(target);

    const result = await moveFolderPath(source, target, { allowPath: allowInside(root), allowDestinationPath: allowInside(root) });

    assert.equal(result.ok, true);
    assert.equal(result.ok ? result.moved.to : '', join(target, 'Source'));
    assert.equal(result.ok ? result.moved.kind : '', 'directory');
}));

test('folder move rejects source and target outside allowlist', async () => withTempDir(async (root) => {
    const source = join(root, 'note.md');
    const target = join(root, 'Target');
    await writeFile(source, '# note');
    await mkdir(target);

    const sourceRejected = await moveFolderPath(source, target, { allowPath: () => false, allowDestinationPath: () => false });
    const targetRejected = await moveFolderPath(source, target, {
        allowPath: (path) => path === source,
        allowDestinationPath: () => false,
    });

    assert.equal(sourceRejected.ok, false);
    assert.equal(sourceRejected.ok ? '' : sourceRejected.code, 'source_not_allowed');
    assert.equal(targetRejected.ok, false);
    assert.equal(targetRejected.ok ? '' : targetRejected.code, 'target_not_allowed');
}));

test('folder move rejects symlink source and symlink target directory', async () => withTempDir(async (root) => {
    const source = join(root, 'note.md');
    const linkSource = join(root, 'note-link.md');
    const target = join(root, 'Target');
    const targetLink = join(root, 'TargetLink');
    await writeFile(source, '# note');
    await mkdir(target);
    await symlink(source, linkSource);
    await symlink(target, targetLink);

    const sourceRejected = await moveFolderPath(linkSource, target, { allowPath: allowInside(root), allowDestinationPath: allowInside(root) });
    const targetRejected = await moveFolderPath(source, targetLink, { allowPath: allowInside(root), allowDestinationPath: allowInside(root) });

    assert.equal(sourceRejected.ok, false);
    assert.equal(sourceRejected.ok ? '' : sourceRejected.code, 'symlink_not_allowed');
    assert.equal(targetRejected.ok, false);
    assert.equal(targetRejected.ok ? '' : targetRejected.code, 'symlink_not_allowed');
}));

test('folder move rejects moving a directory into itself or descendant', async () => withTempDir(async (root) => {
    const source = join(root, 'Source');
    const child = join(source, 'Child');
    await mkdir(child, { recursive: true });

    const self = await moveFolderPath(source, source, { allowPath: allowInside(root), allowDestinationPath: allowInside(root) });
    const descendant = await moveFolderPath(source, child, { allowPath: allowInside(root), allowDestinationPath: allowInside(root) });

    assert.equal(self.ok, false);
    assert.equal(self.ok ? '' : self.code, 'self_or_descendant');
    assert.equal(descendant.ok, false);
    assert.equal(descendant.ok ? '' : descendant.code, 'self_or_descendant');
}));

test('folder move rejects target name conflicts', async () => withTempDir(async (root) => {
    const source = join(root, 'note.md');
    const target = join(root, 'Target');
    await writeFile(source, '# note');
    await mkdir(target);
    await writeFile(join(target, 'note.md'), '# existing');

    const result = await moveFolderPath(source, target, { allowPath: allowInside(root), allowDestinationPath: allowInside(root) });

    assert.equal(result.ok, false);
    assert.equal(result.ok ? '' : result.code, 'target_exists');
}));

test('folder move reports move_failed when rename fails', async () => withTempDir(async (root) => {
    const source = join(root, 'note.md');
    const target = join(root, 'Target');
    await writeFile(source, '# note');
    await mkdir(target);

    const result = await moveFolderPath(source, target, {
        allowPath: allowInside(root),
        allowDestinationPath: allowInside(root),
        renameImpl: async () => { throw new Error('rename exploded'); },
    });

    assert.equal(result.ok, false);
    assert.equal(result.ok ? '' : result.code, 'move_failed');
    assert.match(result.ok ? '' : result.error, /rename exploded/);
}));
