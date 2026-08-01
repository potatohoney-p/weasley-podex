import test from 'node:test';
import assert from 'node:assert/strict';
import {
    createComposerState, appendTextToComposer, killWordComposer, yankComposer,
    undoComposer, killToStartComposer, getComposerDisplayText,
} from '../../src/cli/tui/composer.ts';

test('killWordComposer removes the word before the cursor', () => {
    const s = createComposerState();
    appendTextToComposer(s, 'foo bar baz');
    killWordComposer(s);
    assert.equal(getComposerDisplayText(s), 'foo bar ');
});

test('yankComposer restores the last kill', () => {
    const s = createComposerState();
    appendTextToComposer(s, 'hello world');
    killWordComposer(s);
    yankComposer(s);
    assert.equal(getComposerDisplayText(s), 'hello world');
});

test('undoComposer reverts the last edit', () => {
    const s = createComposerState();
    appendTextToComposer(s, 'foo bar');
    killWordComposer(s);
    appendTextToComposer(s, 'baz');
    undoComposer(s);
    assert.equal(getComposerDisplayText(s), 'foo ');
});

test('killToStartComposer clears text before the cursor', () => {
    const s = createComposerState();
    appendTextToComposer(s, 'hello');
    s.cursor = 5;
    killToStartComposer(s);
    assert.equal(getComposerDisplayText(s), '');
});
