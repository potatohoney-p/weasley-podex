import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function read(relPath: string): string {
    return readFileSync(join(root, relPath), 'utf8');
}

test('manager preview iframe listens for jaw-preview-open-notes', () => {
    const preview = read('public/manager/src/InstancePreview.tsx');
    assert.ok(preview.includes("data.type !== 'jaw-preview-open-notes'"), 'InstancePreview must handle open-notes message');
    assert.ok(preview.includes('onOpenNotesFromPreview'), 'InstancePreview must expose callback prop');
});

test('manager app wires preview click to notes selection and highlight', () => {
    const app = read('public/manager/src/App.tsx');
    const router = read('public/manager/src/SidebarRailRouter.tsx');
    const tree = read('public/manager/src/notes/NotesFileTree.tsx');
    const sidebar = read('public/manager/src/notes/NotesSidebar.tsx');

    assert.ok(app.includes('function openNotesFromPreview'), 'App must define openNotesFromPreview');
    assert.ok(app.includes("handleSidebarModeChange('notes')"), 'preview click must switch to notes workspace');
    assert.ok(app.includes('flashNotesPath'), 'preview click must flash highlighted path');
    assert.ok(router.includes('onOpenNotesFromPreview: props.onOpenNotesFromPreview') || router.includes('onOpenNotesFromPreview: props.onOpenNotesFromPreview }'), 'router must pass callback to preview');
    assert.ok(router.includes('highlightedPath={props.notesHighlightedPath}'), 'router must pass highlight to NotesSidebar');
    assert.ok(sidebar.includes('highlightedPath={props.highlightedPath'), 'NotesSidebar must forward highlight to tree');
    assert.ok(tree.includes('is-highlighted'), 'NotesFileTree must render highlight class');
    assert.ok(tree.includes('externalFocusPath'), 'NotesFileTree must expand ancestor folders on focus');
});
