import test from 'node:test';
import assert from 'node:assert/strict';
import { handleKeyInput } from '../../bin/commands/tui/input-handler.ts';
import { createTuiStore } from '../../src/cli/tui/store.ts';
import { getComposerDisplayText } from '../../src/cli/tui/composer.ts';
import type { TuiContext } from '../../bin/commands/tui/types.ts';

// Integration verification of the Phase-3b cursor key routing (input-handler →
// composer), the part unit tests of the composer model / cursorScreenPos cannot
// cover. Live terminal rendering is exercised separately; Computer Use cannot
// drive Terminal.app (policy), so this asserts the input pipeline by state.
function mockStdout(): () => void {
    const origWrite = process.stdout.write.bind(process.stdout);
    const desc = Object.getOwnPropertyDescriptor(process.stdout, 'columns');
    (process.stdout as unknown as { write: (s: string) => boolean }).write = () => true;
    Object.defineProperty(process.stdout, 'columns', { value: 80, configurable: true });
    return () => {
        (process.stdout as unknown as { write: typeof origWrite }).write = origWrite;
        if (desc) Object.defineProperty(process.stdout, 'columns', desc);
    };
}

function makeCtx(): TuiContext {
    // Minimal context for handleKeyInput — only the fields it touches matter.
    return {
        ws: { send() { /* no-op */ }, close() { /* no-op */ } },
        apiUrl: '', info: { cli: 'codex', workingDir: '~', model: '' },
        accent: '', label: 'codex', dir: '~', runtimeLocale: 'en',
        tuiConfig: { pasteCollapseLines: 2, pasteCollapseChars: 160 },
        values: { port: '3457', raw: false, simple: false }, isRaw: false,
        store: createTuiStore(),
        overlayBoxHeight: 0, inputActive: true, streaming: false, streamSink: null,
        commandRunning: false, escPending: false, escTimer: null,
        prevLineCount: 1, promptCursorRow: 0, resizeTimer: null,
        ideEnabled: false, idePopEnabled: false, preFileSetQueue: [], chatCwd: '/tmp',
        isGit: false, detectedIde: null, promptPrefix: '  > ', footer: '',
    } as unknown as TuiContext;
}

test('arrow-left routes to cursor move; typing inserts mid-line', () => {
    const restore = mockStdout();
    try {
        const ctx = makeCtx();
        for (const ch of 'hello') handleKeyInput(ctx, ch);
        assert.equal(getComposerDisplayText(ctx.store.composer), 'hello');
        assert.equal(ctx.store.composer.cursor, 5);
        handleKeyInput(ctx, '\x1b[D');
        handleKeyInput(ctx, '\x1b[D');
        assert.equal(ctx.store.composer.cursor, 3);
        handleKeyInput(ctx, 'X');
        assert.equal(getComposerDisplayText(ctx.store.composer), 'helXlo');
        assert.equal(ctx.store.composer.cursor, 4);
    } finally { restore(); }
});

test('Home/End and arrow-right route to cursor moves', () => {
    const restore = mockStdout();
    try {
        const ctx = makeCtx();
        for (const ch of 'abc') handleKeyInput(ctx, ch);
        handleKeyInput(ctx, '\x1b[H'); // Home
        assert.equal(ctx.store.composer.cursor, 0);
        handleKeyInput(ctx, 'Z');
        assert.equal(getComposerDisplayText(ctx.store.composer), 'Zabc');
        assert.equal(ctx.store.composer.cursor, 1);
        handleKeyInput(ctx, '\x1b[F'); // End
        assert.equal(ctx.store.composer.cursor, 4);
        handleKeyInput(ctx, '\x1b[C'); // arrow-right at end → clamp
        assert.equal(ctx.store.composer.cursor, 4);
    } finally { restore(); }
});

test('Alt+b / Alt+f route to word motions', () => {
    const restore = mockStdout();
    try {
        const ctx = makeCtx();
        for (const ch of 'foo bar') handleKeyInput(ctx, ch);
        assert.equal(ctx.store.composer.cursor, 7);
        handleKeyInput(ctx, '\x1bb'); // word-left
        assert.equal(ctx.store.composer.cursor, 4);
        handleKeyInput(ctx, '\x1bb');
        assert.equal(ctx.store.composer.cursor, 0);
        handleKeyInput(ctx, '\x1bf'); // word-right
        assert.equal(ctx.store.composer.cursor, 3);
    } finally { restore(); }
});

test('backspace deletes before the cursor after a left move', () => {
    const restore = mockStdout();
    try {
        const ctx = makeCtx();
        for (const ch of 'abcd') handleKeyInput(ctx, ch);
        handleKeyInput(ctx, '\x1b[D'); // cursor before 'd'
        handleKeyInput(ctx, '\x7f');   // delete 'c'
        assert.equal(getComposerDisplayText(ctx.store.composer), 'abd');
        assert.equal(ctx.store.composer.cursor, 2);
    } finally { restore(); }
});
