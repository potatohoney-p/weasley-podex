import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveDroppedPaths } from '../../electron/src/main/lib/folder/dropped-paths.js';

async function fixtureRoot(): Promise<string> {
    return await mkdtemp(join(tmpdir(), 'jaw-drop-paths-'));
}

test('dropped directory allowlists the directory itself', async () => {
    const root = await fixtureRoot();
    const dropped = join(root, 'Project');
    const addedRoots: string[] = [];
    await mkdir(dropped);

    const result = await resolveDroppedPaths([dropped], {
        allowPath: path => path.startsWith(root),
        addRoot: rootPath => addedRoots.push(rootPath),
    });

    assert.deepEqual(result.rejected, []);
    assert.equal(result.entries.length, 1);
    assert.equal(result.entries[0]?.kind, 'directory');
    assert.equal(result.entries[0]?.path, dropped);
    assert.deepEqual(addedRoots, [dropped]);
});

test('dropped file allowlists its parent directory', async () => {
    const root = await fixtureRoot();
    const dropped = join(root, 'note.md');
    const addedRoots: string[] = [];
    await writeFile(dropped, '# note');

    const result = await resolveDroppedPaths([dropped], {
        allowPath: path => path.startsWith(root),
        addRoot: rootPath => addedRoots.push(rootPath),
    });

    assert.deepEqual(result.rejected, []);
    assert.equal(result.entries.length, 1);
    assert.equal(result.entries[0]?.kind, 'file');
    assert.equal(result.entries[0]?.path, dropped);
    assert.deepEqual(addedRoots, [root]);
});

test('dropped path outside the allowed boundary is rejected', async () => {
    const root = await fixtureRoot();
    const outside = join(await fixtureRoot(), 'outside.md');
    await writeFile(outside, 'outside');

    const result = await resolveDroppedPaths([outside], {
        allowPath: path => path.startsWith(root),
    });

    assert.deepEqual(result.entries, []);
    assert.equal(result.rejected.length, 1);
    assert.equal(result.rejected[0]?.reason, 'path not allowed');
});

test('dropped symlink is rejected', async (t) => {
    const root = await fixtureRoot();
    const target = join(root, 'target.md');
    const link = join(root, 'link.md');
    await writeFile(target, 'target');
    try {
        await symlink(target, link);
    } catch (error) {
        t.skip(`symlink unavailable: ${(error as Error).message}`);
        return;
    }

    const result = await resolveDroppedPaths([link], {
        allowPath: path => path.startsWith(root),
    });

    assert.deepEqual(result.entries, []);
    assert.equal(result.rejected.length, 1);
    assert.equal(result.rejected[0]?.reason, 'symlinks not allowed');
});

test('preload does not expose a renderer string-path allowlist', () => {
    const preload = readFileSync(new URL('../../electron/src/preload/index.ts', import.meta.url), 'utf8');
    assert.equal(preload.includes('allowDroppedPaths'), false);
    assert.match(preload, /resolveDroppedItems/);
    assert.match(preload, /webUtils\.getPathForFile/);
});
