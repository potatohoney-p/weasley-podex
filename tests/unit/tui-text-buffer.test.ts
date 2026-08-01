import test from 'node:test';
import assert from 'node:assert/strict';
import { createTextBuffer } from '../../src/cli/tui/text-buffer.ts';

test('insert advances cursor and builds text', () => {
    const b = createTextBuffer();
    b.insert('hello');
    assert.equal(b.text(), 'hello');
    assert.equal(b.cursor(), 5);
});

test('mid-line insert at cursor', () => {
    const b = createTextBuffer();
    b.setText('hello', 0);
    b.insert('X');
    assert.equal(b.text(), 'Xhello');
    assert.equal(b.cursor(), 1);
});

test('left/right move and clamp', () => {
    const b = createTextBuffer('abc'); // cursor at 3
    b.left(); assert.equal(b.cursor(), 2);
    b.home(); assert.equal(b.cursor(), 0);
    b.left(); assert.equal(b.cursor(), 0); // clamp
    b.end(); assert.equal(b.cursor(), 3);
    b.right(); assert.equal(b.cursor(), 3); // clamp
});

test('backspace and delete at the cursor', () => {
    const b = createTextBuffer();
    b.setText('abc', 2);
    b.backspace();
    assert.equal(b.text(), 'ac');
    assert.equal(b.cursor(), 1);
    b.setText('abc', 1);
    b.delete();
    assert.equal(b.text(), 'ac');
    assert.equal(b.cursor(), 1);
});

test('word motions', () => {
    const b = createTextBuffer('foo bar baz'); // cursor 11
    b.wordLeft(); assert.equal(b.cursor(), 8); // start of "baz"
    b.wordLeft(); assert.equal(b.cursor(), 4); // start of "bar"
    b.home(); b.wordRight(); assert.equal(b.cursor(), 3); // end of "foo"
});

test('kill-to-end and yank', () => {
    const b = createTextBuffer();
    b.setText('hello world', 6);
    b.killToEnd();
    assert.equal(b.text(), 'hello ');
    assert.equal(b.cursor(), 6);
    b.yank();
    assert.equal(b.text(), 'hello world');
    assert.equal(b.cursor(), 11);
});

test('kill-to-start', () => {
    const b = createTextBuffer();
    b.setText('hello world', 6);
    b.killToStart();
    assert.equal(b.text(), 'world');
    assert.equal(b.cursor(), 0);
});

test('kill-word before cursor', () => {
    const b = createTextBuffer('foo bar'); // cursor 7
    b.killWord();
    assert.equal(b.text(), 'foo ');
    assert.equal(b.cursor(), 4);
    b.yank();
    assert.equal(b.text(), 'foo bar');
});

test('undo coalesces an insert run, redo restores', () => {
    const b = createTextBuffer();
    b.insert('a'); b.insert('b'); b.insert('c');
    assert.equal(b.text(), 'abc');
    b.undo();
    assert.equal(b.text(), ''); // whole coalesced run undone
    b.redo();
    assert.equal(b.text(), 'abc');
});

test('undo distinguishes insert runs from other ops', () => {
    const b = createTextBuffer();
    b.insert('hi');     // run 1
    b.backspace();      // other op -> own undo entry
    assert.equal(b.text(), 'h');
    b.undo();           // restore 'hi'
    assert.equal(b.text(), 'hi');
    b.undo();           // restore ''
    assert.equal(b.text(), '');
});

test('grapheme-aware cursor (CJK + emoji move as one unit)', () => {
    const b = createTextBuffer('a👍b'); // 3 graphemes
    assert.equal(b.length(), 3);
    b.left(); assert.equal(b.cursor(), 2); // before 'b'
    b.left(); assert.equal(b.cursor(), 1); // before the emoji (single step)
    const c = createTextBuffer();
    c.insert('가나다');
    assert.equal(c.length(), 3);
    assert.equal(c.cursor(), 3);
});

test('clear empties the buffer', () => {
    const b = createTextBuffer('xyz');
    b.clear();
    assert.equal(b.text(), '');
    assert.equal(b.cursor(), 0);
});
