import test from 'node:test';
import assert from 'node:assert/strict';
import {
    createComposerState, appendTextToComposer, appendPasteToComposer,
    backspaceComposer, deleteForwardComposer, clearComposer,
    moveCursorLeft, moveCursorRight, moveCursorHome, moveCursorEnd,
    moveCursorWordLeft, moveCursorWordRight,
    getComposerDisplayText, getDisplayCursorOffset,
} from '../../src/cli/tui/composer.ts';

test('typing appends at end (behavior-preserving when cursor stays at end)', () => {
    const s = createComposerState();
    for (const ch of 'hello') appendTextToComposer(s, ch);
    assert.equal(getComposerDisplayText(s), 'hello');
    assert.equal(s.cursor, 5);
});

test('mid-line insert at the cursor', () => {
    const s = createComposerState();
    appendTextToComposer(s, 'hello');
    moveCursorHome(s);
    moveCursorRight(s); // cursor after 'h'
    appendTextToComposer(s, 'X');
    assert.equal(getComposerDisplayText(s), 'hXello');
    assert.equal(s.cursor, 2);
});

test('backspace deletes before the cursor (mid-line)', () => {
    const s = createComposerState();
    appendTextToComposer(s, 'hello');
    moveCursorHome(s);
    moveCursorRight(s); // after 'h'
    backspaceComposer(s); // removes 'h'
    assert.equal(getComposerDisplayText(s), 'ello');
    assert.equal(s.cursor, 0);
});

test('delete-forward removes the grapheme at the cursor', () => {
    const s = createComposerState();
    appendTextToComposer(s, 'hello');
    moveCursorHome(s);
    deleteForwardComposer(s);
    assert.equal(getComposerDisplayText(s), 'ello');
    assert.equal(s.cursor, 0);
});

test('cursor left/right clamp at bounds', () => {
    const s = createComposerState();
    appendTextToComposer(s, 'ab');
    moveCursorRight(s); assert.equal(s.cursor, 2); // clamp
    moveCursorLeft(s); moveCursorLeft(s); moveCursorLeft(s);
    assert.equal(s.cursor, 0); // clamp
});

test('word motions', () => {
    const s = createComposerState();
    appendTextToComposer(s, 'foo bar baz'); // cursor 11
    moveCursorWordLeft(s); assert.equal(s.cursor, 8);
    moveCursorWordLeft(s); assert.equal(s.cursor, 4);
    moveCursorHome(s); moveCursorWordRight(s); assert.equal(s.cursor, 3);
    moveCursorEnd(s); assert.equal(s.cursor, 11);
});

test('grapheme-aware cursor (CJK moves one unit)', () => {
    const s = createComposerState();
    appendTextToComposer(s, '가나다');
    assert.equal(s.cursor, 3);
    moveCursorLeft(s); assert.equal(s.cursor, 2);
    appendTextToComposer(s, 'X');
    assert.equal(getComposerDisplayText(s), '가나X다');
});

test('clear resets the cursor', () => {
    const s = createComposerState();
    appendTextToComposer(s, 'xyz');
    clearComposer(s);
    assert.equal(s.cursor, 0);
    assert.equal(getComposerDisplayText(s), '');
});

test('display cursor offset accounts for a preceding paste label', () => {
    const s = createComposerState();
    appendPasteToComposer(s, 'A'.repeat(500)); // collapses to a [Pasted text ...] label
    appendTextToComposer(s, 'hi');
    moveCursorHome(s); // start of the trailing text (after the paste label)
    const display = getComposerDisplayText(s);
    const labelLen = display.length - 'hi'.length;
    assert.equal(getDisplayCursorOffset(s), labelLen);
    moveCursorEnd(s);
    assert.equal(getDisplayCursorOffset(s), labelLen + 2);
});
