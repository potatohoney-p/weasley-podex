import test from 'node:test';
import assert from 'node:assert/strict';
import {
    displayShellCommand,
    displayShellCommandDetail,
    unwrapShellLoginCommand,
} from '../../src/shared/shell-command-display.ts';

test('unwrapShellLoginCommand hides zsh -lc wrappers for display', () => {
    assert.equal(
        unwrapShellLoginCommand('/bin/zsh -lc "nl -ba \\"resource/file.css\\""'),
        'nl -ba "resource/file.css"',
    );
    assert.equal(
        unwrapShellLoginCommand("/bin/zsh -lc 'git status --short'"),
        'git status --short',
    );
    assert.equal(
        unwrapShellLoginCommand("/bin/zsh -lc 'git status --shor…"),
        'git status --shor…',
    );
});

test('displayShellCommand leaves non-wrapper commands unchanged', () => {
    assert.equal(displayShellCommand('npm run typecheck'), 'npm run typecheck');
});

test('displayShellCommandDetail unwraps the command line and keeps output', () => {
    const detail = "$ /bin/zsh -lc 'git status --short'\n M README.md";
    assert.equal(displayShellCommandDetail(detail), '$ git status --short\n M README.md');
});
