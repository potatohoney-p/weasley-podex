import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { filterNoteCommands } from '../../public/manager/src/notes/NotesCommandPalette.tsx';
import { isCommandPaletteShortcut, isQuickSwitcherShortcut } from '../../public/manager/src/notes/notes-shortcuts.ts';
import type { NoteCommand } from '../../public/manager/src/notes/notes-command-registry.tsx';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..', '..');

function read(path: string): string {
    return readFileSync(join(root, path), 'utf8');
}

function keyEvent(key: string, modifiers: Partial<Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>> = {}): KeyboardEvent {
    return {
        altKey: modifiers.altKey === true,
        ctrlKey: modifiers.ctrlKey === true,
        key,
        metaKey: modifiers.metaKey === true,
        shiftKey: modifiers.shiftKey === true,
        target: null,
    } as KeyboardEvent;
}

function command(id: string, label: string, keywords: string[] = []): NoteCommand {
    return { id, label, keywords, section: 'Test', run: () => undefined };
}

test('notes shortcut helpers keep quick switcher and command palette separate', () => {
    assert.equal(isQuickSwitcherShortcut(keyEvent('p', { metaKey: true })), true);
    assert.equal(isQuickSwitcherShortcut(keyEvent('p', { metaKey: true, shiftKey: true })), false);
    assert.equal(isCommandPaletteShortcut(keyEvent('p', { metaKey: true, shiftKey: true })), true);
    assert.equal(isCommandPaletteShortcut(keyEvent('p', { metaKey: true })), false);
    assert.equal(isCommandPaletteShortcut(keyEvent('p', { ctrlKey: true, shiftKey: true })), true);
});

test('notes command palette filters labels and keywords', () => {
    const results = filterNoteCommands([
        command('workspace:save', 'Save note'),
        command('sidebar:today', 'Open today', ['daily']),
        command('workspace:view-graph', 'Open graph'),
    ], 'daily');

    assert.equal(results.length, 1);
    assert.equal(results[0]?.command.id, 'sidebar:today');
});

test('notes command palette source exposes required accessibility and disabled contracts', () => {
    const palette = read('public/manager/src/notes/NotesCommandPalette.tsx');
    const registry = read('public/manager/src/notes/notes-command-registry.tsx');

    assert.ok(palette.includes('role="dialog"'), 'palette must render a dialog');
    assert.ok(palette.includes('aria-modal="true"'), 'palette dialog must be modal');
    assert.ok(palette.includes('role="listbox"'), 'palette must expose listbox semantics');
    assert.ok(palette.includes('role="option"'), 'palette rows must expose options');
    assert.ok(palette.includes('aria-activedescendant'), 'palette input must track the active command');
    assert.ok(palette.includes('aria-disabled'), 'disabled commands must be announced');
    assert.ok(palette.includes('data-notes-palette'), 'palette must mark its subtree for shortcut isolation');
    assert.ok(palette.includes('Promise.resolve(command.run())'), 'palette must catch async command failures');
    assert.ok(registry.includes('duplicate command id'), 'registry must warn on duplicate command IDs');
    assert.ok(registry.includes('return register(commands)'), 'registry hook must unregister commands through effect cleanup');
});
