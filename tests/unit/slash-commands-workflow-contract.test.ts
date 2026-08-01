import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const slashCommandsSource = readFileSync(
    new URL('../../public/js/features/slash-commands.ts', import.meta.url),
    'utf8',
);
const chatCssSource = readFileSync(
    new URL('../../public/css/chat.css', import.meta.url),
    'utf8',
);

test('slash command palette defines frontend workflow metadata shape', () => {
    assert.match(slashCommandsSource, /interface WorkflowCommandMeta/);
    assert.match(slashCommandsSource, /workflowArgs\?: Array<\{ name: string; required: boolean; kind: string \}>;/);
    assert.match(slashCommandsSource, /workflow\?: WorkflowCommandMeta \| null;/);
});

test('slash command palette renders structured workflow args, not raw objects', () => {
    assert.match(slashCommandsSource, /function formatWorkflowArgs\(cmd: SlashCommand\): string/);
    assert.match(slashCommandsSource, /cmd\.workflow\?\.workflowArgs \|\| \[\]/);
    assert.match(slashCommandsSource, /escapeHtml\(args\)/);
    assert.doesNotMatch(slashCommandsSource, /\[object Object\]/);
});

test('slash command palette renders compact workflow metadata chips', () => {
    assert.match(slashCommandsSource, /function renderWorkflowMeta\(cmd: SlashCommand\): string/);
    assert.match(slashCommandsSource, /cmd-meta/);
    assert.match(slashCommandsSource, /cmd-risk-\$\{escapeHtml\(wf\.risk\)\}/);
    assert.match(chatCssSource, /\.cmd-meta/);
    assert.match(chatCssSource, /\.cmd-chip/);
    assert.match(chatCssSource, /\.cmd-risk-high/);
    assert.match(chatCssSource, /\.cmd-risk-medium/);
});
