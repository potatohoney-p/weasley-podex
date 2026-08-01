import test from 'node:test';
import assert from 'node:assert/strict';
import { rebuildFooter, shortenProjectPathForFooter } from '../../bin/commands/tui/renderer.ts';
import type { TuiContext } from '../../bin/commands/tui/types.ts';
import { createTuiStore } from '../../src/cli/tui/store.ts';

function stripAnsi(text: string): string {
    return text.replace(/\x1b\[[0-9;]*m/g, '');
}

function withColumns<T>(cols: number, fn: () => T): T {
    const columnsDesc = Object.getOwnPropertyDescriptor(process.stdout, 'columns');
    Object.defineProperty(process.stdout, 'columns', { value: cols, configurable: true });
    try {
        return fn();
    } finally {
        if (columnsDesc) Object.defineProperty(process.stdout, 'columns', columnsDesc);
    }
}

test('footer project path shortener keeps final useful project segments', () => {
    assert.equal(
        shortenProjectPathForFooter('/Users/example/Developer/700_projects/weasley-podex'),
        '.../700_projects/weasley-podex',
    );
});

test('rebuildFooter prefers projectRoot over server workingDir', () => {
    const ctx = {
        info: { cli: 'codex', workingDir: '/Users/example/.weasley/podex-3458', model: 'test-model' },
        label: 'jaw',
        accent: '\x1b[36m',
        streamState: 'idle',
        turnStartedAt: 0,
        bgtaskCount: 0,
        isGit: true,
        gitBranch: 'dev',
        projectRoot: '/Users/example/Developer/700_projects/weasley-podex',
        serverPort: 3457,
        store: createTuiStore(),
        tuiConfig: { pasteCollapseLines: 2, pasteCollapseChars: 160 },
        displayMode: 'fullscreen',
    } as unknown as TuiContext;

    withColumns(120, () => rebuildFooter(ctx));
    const footer = stripAnsi(ctx.footer);

    assert.match(footer, /700_projects\/weasley-podex/);
    assert.match(footer, /dev/);
    assert.doesNotMatch(footer, /\.weasley\/podex-3458/);
});

