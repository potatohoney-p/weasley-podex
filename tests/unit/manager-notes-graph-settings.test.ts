import assert from 'node:assert/strict';
import test from 'node:test';
import {
    DEFAULT_NOTES_GRAPH_SETTINGS,
    cloneNotesGraphSettings,
    normalizeNotesGraphSettings,
} from '../../public/manager/src/notes/graph/notes-graph-settings';

test('notes graph settings default keeps unresolved nodes visible', () => {
    const settings = cloneNotesGraphSettings(DEFAULT_NOTES_GRAPH_SETTINGS);

    assert.equal(settings.version, 1);
    assert.equal(settings.existingFilesOnly, false);
    assert.equal(settings.showOrphans, true);
    assert.equal(settings.showTags, true);
    assert.equal(settings.focusSelected, false);
});

test('notes graph settings normalize clamps unsafe persisted values', () => {
    const settings = normalizeNotesGraphSettings({
        panelOpen: false,
        collapsedSections: { filters: true, bad: true },
        query: ' tag:core ',
        existingFilesOnly: true,
        showOrphans: false,
        focusSelected: true,
        focusDepth: 99,
        groupMode: 'query',
        groups: [
            { id: ' hot ', label: ' Hot ', query: 'tag:hot', color: '#ff7b72', enabled: false },
            { id: 'empty', label: 'Empty', query: '', color: 'bad', enabled: true },
        ],
        nodeSize: 99,
        linkDistance: 999,
        chargeStrength: -9999,
        labelDensity: 9,
        showArrows: true,
        animate: false,
    });

    assert.equal(settings.panelOpen, false);
    assert.deepEqual(settings.collapsedSections, { filters: true });
    assert.equal(settings.query, 'tag:core');
    assert.equal(settings.existingFilesOnly, true);
    assert.equal(settings.showOrphans, false);
    assert.equal(settings.focusDepth, 4);
    assert.equal(settings.groups.length, 1);
    assert.equal(settings.groups[0]?.label, 'Hot');
    assert.equal(settings.groups[0]?.enabled, false);
    assert.equal(settings.nodeSize, 2);
    assert.equal(settings.linkDistance, 240);
    assert.equal(settings.chargeStrength, -800);
    assert.equal(settings.labelDensity, 1);
    assert.equal(settings.showArrows, true);
    assert.equal(settings.animate, false);
});
