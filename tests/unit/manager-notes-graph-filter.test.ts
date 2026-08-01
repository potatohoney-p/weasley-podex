import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveNotesGraphData } from '../../public/manager/src/notes/graph/notes-graph-filter';
import { cloneNotesGraphSettings, DEFAULT_NOTES_GRAPH_SETTINGS } from '../../public/manager/src/notes/graph/notes-graph-settings';
import type { NotesVaultIndexSnapshot } from '../../public/manager/src/notes/notes-types';

function fixture(): NotesVaultIndexSnapshot {
    return {
        version: 1,
        notes: [
            { path: 'alpha.md', title: 'Alpha', aliases: ['A'], tags: ['core'], mtimeMs: 1, size: 10, revision: 'a' },
            { path: 'beta.md', title: 'Beta', aliases: [], tags: ['core', 'ops'], mtimeMs: 2, size: 12, revision: 'b' },
            { path: 'orphan.md', title: 'Orphan', aliases: [], tags: [], mtimeMs: 3, size: 8, revision: 'o' },
        ],
        outgoingLinks: {},
        backlinks: {},
        unresolvedLinks: [],
        graph: {
            nodes: [
                { id: 'alpha.md', title: 'Alpha', kind: 'note', path: 'alpha.md' },
                { id: 'beta.md', title: 'Beta', kind: 'note', path: 'beta.md' },
                { id: 'orphan.md', title: 'Orphan', kind: 'note', path: 'orphan.md' },
                { id: 'missing:Ghost', title: 'Ghost', kind: 'missing' },
            ],
            edges: [
                { source: 'alpha.md', target: 'beta.md', raw: '[[Beta]]', status: 'resolved', resolvedPath: 'beta.md' },
                { source: 'alpha.md', target: 'missing:Ghost', raw: '[[Ghost]]', status: 'missing' },
            ],
        },
        errors: [],
    };
}

test('notes graph filter defaults keep broken links as visible red-node data', () => {
    const settings = cloneNotesGraphSettings(DEFAULT_NOTES_GRAPH_SETTINGS);
    const data = deriveNotesGraphData(fixture(), settings, null);

    assert.equal(data.nodes.some(node => node.id === 'missing:Ghost' && node.kind === 'missing'), true);
    assert.equal(data.missingCount, 1);
    assert.equal(data.linkCount, 2);
});

test('notes graph filter hides broken links when existing files only is enabled', () => {
    const settings = { ...cloneNotesGraphSettings(DEFAULT_NOTES_GRAPH_SETTINGS), existingFilesOnly: true };
    const data = deriveNotesGraphData(fixture(), settings, null);

    assert.equal(data.nodes.some(node => node.kind === 'missing'), false);
    assert.equal(data.linkCount, 1);
});

test('notes graph filter adds tag nodes and supports selected focus depth', () => {
    const settings = {
        ...cloneNotesGraphSettings(DEFAULT_NOTES_GRAPH_SETTINGS),
        focusSelected: true,
        focusDepth: 1,
        groups: [{ id: 'core', label: 'Core', query: 'tag:core', color: '#7c9cff', enabled: true }],
    };
    const data = deriveNotesGraphData(fixture(), settings, 'beta.md');

    assert.equal(data.nodes.some(node => node.id === 'alpha.md'), true);
    assert.equal(data.nodes.some(node => node.id === 'orphan.md'), false);
    assert.equal(data.nodes.some(node => node.kind === 'tag' && node.title === '#core'), true);
    assert.equal(data.nodes.find(node => node.id === 'beta.md')?.groupLabel, 'Core');
});

test('notes graph filter removes orphans when requested', () => {
    const settings = { ...cloneNotesGraphSettings(DEFAULT_NOTES_GRAPH_SETTINGS), showOrphans: false, showTags: false };
    const data = deriveNotesGraphData(fixture(), settings, null);

    assert.equal(data.nodes.some(node => node.id === 'orphan.md'), false);
    assert.equal(data.nodes.some(node => node.id === 'alpha.md'), true);
});
