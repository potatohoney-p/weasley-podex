import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyKeyAction, splitKeyInput } from '../../src/cli/tui/keymap.ts';

test('classifyKeyAction detects navigation escape sequences', () => {
    assert.equal(classifyKeyAction('\x1b[A'), 'arrow-up');
    assert.equal(classifyKeyAction('\x1bOB'), 'arrow-down');
    assert.equal(classifyKeyAction('\x1b[5~'), 'page-up');
    assert.equal(classifyKeyAction('\x1b[6~'), 'page-down');
    assert.equal(classifyKeyAction('\x1b[H'), 'home');
    assert.equal(classifyKeyAction('\x1bOF'), 'end');
});

test('classifyKeyAction detects enter family and control keys', () => {
    assert.equal(classifyKeyAction('\x1b\n'), 'option-enter');
    assert.equal(classifyKeyAction('\r'), 'enter');
    assert.equal(classifyKeyAction('\x7f'), 'backspace');
    assert.equal(classifyKeyAction('\x03'), 'ctrl-c');
    assert.equal(classifyKeyAction('\x15'), 'ctrl-u');
});

test('classifyKeyAction detects ctrl-k', () => {
    assert.equal(classifyKeyAction('\x0b'), 'ctrl-k');
});

test('classifyKeyAction detects ctrl-o', () => {
    assert.equal(classifyKeyAction('\x0f'), 'ctrl-o');
});

test('classifyKeyAction detects edit chord keys', () => {
    assert.equal(classifyKeyAction('\x17'), 'ctrl-w');
    assert.equal(classifyKeyAction('\x19'), 'ctrl-y');
    assert.equal(classifyKeyAction('\x18'), 'ctrl-x');
    assert.equal(classifyKeyAction('\x05'), 'ctrl-e');
    assert.equal(classifyKeyAction('\x1f'), 'ctrl-_');
    assert.equal(classifyKeyAction('\x1b[3~'), 'delete');
});

test('classifyKeyAction detects printable input and unknown keys', () => {
    assert.equal(classifyKeyAction('a'), 'printable');
    assert.equal(classifyKeyAction('가'), 'printable');
    assert.equal(classifyKeyAction('\x00'), 'other');
});

test('classifyKeyAction detects cursor left/right (Phase 3b)', () => {
    assert.equal(classifyKeyAction('\x1b[D'), 'arrow-left');
    assert.equal(classifyKeyAction('\x1bOD'), 'arrow-left');
    assert.equal(classifyKeyAction('\x1b[C'), 'arrow-right');
    assert.equal(classifyKeyAction('\x1bOC'), 'arrow-right');
});

test('classifyKeyAction detects word motions (ctrl/alt arrow, Alt+b/f)', () => {
    assert.equal(classifyKeyAction('\x1b[1;5D'), 'word-left');
    assert.equal(classifyKeyAction('\x1b[1;3D'), 'word-left');
    assert.equal(classifyKeyAction('\x1bb'), 'word-left');
    assert.equal(classifyKeyAction('\x1b[1;5C'), 'word-right');
    assert.equal(classifyKeyAction('\x1b[1;3C'), 'word-right');
    assert.equal(classifyKeyAction('\x1bf'), 'word-right');
});

test('plain b/f stay printable (only ESC-prefixed are word motions)', () => {
    assert.equal(classifyKeyAction('b'), 'printable');
    assert.equal(classifyKeyAction('f'), 'printable');
});

test('splitKeyInput separates batched printable input from enter', () => {
    assert.deepEqual(splitKeyInput('/quit\r'), ['/', 'q', 'u', 'i', 't', '\r']);
    assert.deepEqual(splitKeyInput('ㅎㅇ\n'), ['ㅎ', 'ㅇ', '\n']);
});

test('splitKeyInput preserves escape sequences as single tokens', () => {
    assert.deepEqual(splitKeyInput('\x1b[Aabc'), ['\x1b[A', 'a', 'b', 'c']);
    assert.deepEqual(splitKeyInput('\x1b[1;5D\r'), ['\x1b[1;5D', '\r']);
    assert.deepEqual(splitKeyInput('\x1bbx'), ['\x1bb', 'x']);
});
