import test from 'node:test';
import assert from 'node:assert/strict';
import {
    describeDroppedPathsEvent,
    firstDirectory,
    firstFile,
    isPreviewDropTarget,
    shouldConsumeManagerDrop,
} from '../../public/manager/src/hooks/useElectronDroppedPaths.js';

test('manager drop routing prefers directory entries for folder panel root', () => {
    const entries = [
        { name: 'a.md', path: '/Users/jun/a.md', kind: 'file' as const },
        { name: 'Octopus', path: '/Users/jun/Octopus', kind: 'directory' as const },
    ];
    assert.equal(firstDirectory(entries)?.path, '/Users/jun/Octopus');
    assert.equal(firstFile(entries)?.path, '/Users/jun/a.md');
});

test('drop routing does not consume preview frame drops', () => {
    const preview = {
        closest: (selector: string) => selector.includes('.preview-panel') ? preview : null,
    } as unknown as EventTarget;

    assert.equal(isPreviewDropTarget(preview), true);
    assert.equal(shouldConsumeManagerDrop(preview), false);
});

test('drop routing consumes manager surface drops', () => {
    const surface = {
        closest: () => null,
    } as unknown as EventTarget;

    assert.equal(shouldConsumeManagerDrop(surface), true);
});

test('drop routing describes opened folders and partial rejections', () => {
    const message = describeDroppedPathsEvent({
        source: 'manager',
        entries: [{ name: 'Project', path: '/Users/jun/Project', kind: 'directory' }],
        rejected: [{ path: '/tmp/outside', reason: 'path not allowed' }],
    });

    assert.equal(message, 'Opened dropped folder: Project. 1 rejected.');
});

test('drop routing describes preview captures without routing panels', () => {
    const message = describeDroppedPathsEvent({
        source: 'preview',
        entries: [{ name: 'asset.png', path: '/Users/jun/asset.png', kind: 'file' }],
    });

    assert.equal(message, 'Captured 1 dropped item from preview.');
});

test('preview drop status never implies manager routing success', () => {
    const message = describeDroppedPathsEvent({
        source: 'preview',
        entries: [{ name: 'asset.png', path: '/Users/jun/asset.png', kind: 'file' }],
        rejected: [{ path: '/tmp/outside', reason: 'path not allowed' }],
    });

    assert.ok(message);
    assert.equal(message.includes('Opened'), false);
    assert.equal(message.includes('routed'), false);
    assert.equal(message.includes('uploaded'), false);
});

test('drop routing surfaces rejected-only drop failures', () => {
    const rejected = describeDroppedPathsEvent({
        source: 'manager',
        entries: [],
        rejected: [{ path: '/tmp/outside', reason: 'path not allowed' }],
    });
    const failed = describeDroppedPathsEvent({
        source: 'manager',
        entries: [],
        error: 'path not accessible',
    });

    assert.equal(rejected, 'Drop rejected: path not allowed');
    assert.equal(failed, 'Drop failed: path not accessible');
});
