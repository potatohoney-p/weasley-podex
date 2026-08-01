import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { NotesVaultIndex } from '../../src/manager/notes/vault-index.js';

function tmpRoot(): string {
    return mkdtempSync(join(tmpdir(), 'jaw-notes-index-test-'));
}

test('notes vault index builds metadata, resolved/unresolved links, backlinks, and graph from one snapshot', async (t) => {
    const root = tmpRoot();
    const outside = tmpRoot();
    t.after(() => {
        rmSync(root, { recursive: true, force: true });
        rmSync(outside, { recursive: true, force: true });
    });

    mkdirSync(join(root, 'a'), { recursive: true });
    mkdirSync(join(root, 'b'), { recursive: true });
    mkdirSync(join(root, '.assets'), { recursive: true });
    mkdirSync(join(root, '_templates'), { recursive: true });
    writeFileSync(join(root, 'alpha.md'), [
        '---',
        'title: Alpha Note',
        'aliases: [Start]',
        'tags:',
        '  - "#work"',
        '---',
        'See [[Beta]] [[missing]] [[dup]] [[../secret]].',
        '`[[ignored]]`',
    ].join('\n'));
    writeFileSync(join(root, 'beta.md'), ['---', 'aliases: [Beta]', '---', '# Beta'].join('\n'));
    writeFileSync(join(root, 'a', 'dup.md'), '# A');
    writeFileSync(join(root, 'b', 'dup.md'), '# B');
    writeFileSync(join(root, '.assets', 'hidden.md'), '# Hidden');
    writeFileSync(join(root, '_templates', 'template.md'), '# Template');
    writeFileSync(join(outside, 'outside.md'), '# Outside');
    symlinkSync(join(outside, 'outside.md'), join(root, 'linked.md'));

    const index = new NotesVaultIndex({ root });
    const first = await index.snapshot();

    assert.deepEqual(first.notes.map(note => note.path), ['a/dup.md', 'alpha.md', 'b/dup.md', 'beta.md']);
    const alpha = first.notes.find(note => note.path === 'alpha.md');
    assert.equal(alpha?.title, 'Alpha Note');
    assert.deepEqual(alpha?.aliases, ['Start']);
    assert.deepEqual(alpha?.tags, ['work']);

    const links = first.outgoingLinks['alpha.md'] || [];
    assert.equal(links.length, 4);
    assert.equal(links[0].status, 'resolved');
    assert.equal(links[0].resolvedPath, 'beta.md');
    assert.equal(links[1].status, 'missing');
    assert.equal(links[2].status, 'ambiguous');
    assert.deepEqual(links[2].candidatePaths, ['a/dup.md', 'b/dup.md']);
    assert.equal(links[3].reason, 'invalid_target');
    assert.equal(first.backlinks['beta.md']?.[0]?.sourcePath, 'alpha.md');
    assert.equal(first.unresolvedLinks.length, 3);
    assert.ok(first.graph.nodes.some(node => node.kind === 'missing' && node.id === 'missing:missing'));
    assert.ok(first.graph.nodes.some(node => node.kind === 'ambiguous' && node.id === 'ambiguous:dup'));
    assert.ok(first.errors.some(error => error.code === 'note_symlink_skipped' && error.path === 'linked.md'));

    writeFileSync(join(root, 'alpha.md'), 'See [[beta]].');
    const second = await index.snapshot();
    assert.ok(second.version > first.version);
    assert.equal(second.outgoingLinks['alpha.md']?.[0]?.resolvedPath, 'beta.md');
});

test('notes vault index connects markdown note links in the graph', async (t) => {
    const root = tmpRoot();
    t.after(() => {
        rmSync(root, { recursive: true, force: true });
    });

    mkdirSync(join(root, 'docs'), { recursive: true });
    writeFileSync(join(root, 'overview.md'), [
        '# Overview',
        'See [Beta doc](docs/beta.md) and [Nested](docs/nested.md).',
        'Skip [External](https://example.com) and ![Image](docs/beta.md).',
    ].join('\n'));
    writeFileSync(join(root, 'docs', 'beta.md'), '# Beta');
    writeFileSync(join(root, 'docs', 'nested.md'), 'Back to [Overview](../overview.md).');

    const index = new NotesVaultIndex({ root });
    const snapshot = await index.snapshot();

    assert.deepEqual(snapshot.graph.edges.map(edge => ({
        source: edge.source,
        target: edge.target,
        raw: edge.raw,
        status: edge.status,
    })), [
        { source: 'docs/nested.md', target: 'overview.md', raw: '[Overview](../overview.md)', status: 'resolved' },
        { source: 'overview.md', target: 'docs/beta.md', raw: '[Beta doc](docs/beta.md)', status: 'resolved' },
        { source: 'overview.md', target: 'docs/nested.md', raw: '[Nested](docs/nested.md)', status: 'resolved' },
    ]);
    assert.equal(snapshot.backlinks['docs/beta.md']?.[0]?.sourcePath, 'overview.md');
    assert.equal(snapshot.unresolvedLinks.length, 0);
});

test('notes vault index treats markdown-escaped wikilinks like preview rendering', async (t) => {
    const root = tmpRoot();
    t.after(() => {
        rmSync(root, { recursive: true, force: true });
    });

    mkdirSync(join(root, 'octopus'), { recursive: true });
    writeFileSync(join(root, 'about-jaw.md'), [
        '# Jaw Agent',
        '\\[\\[Project Alpha]]',
        '\\[\\[Workbook Factory 개발자-동업자 액세스 체크리스트]]',
    ].join('\n'));
    writeFileSync(join(root, 'Project Alpha.md'), '# Project Alpha');
    writeFileSync(join(root, 'octopus', 'Workbook Factory 개발자-동업자 액세스 체크리스트.md'), '# Workbook');

    const index = new NotesVaultIndex({ root });
    const snapshot = await index.snapshot();

    assert.deepEqual(snapshot.graph.edges.map(edge => ({
        source: edge.source,
        target: edge.target,
        raw: edge.raw,
        status: edge.status,
    })), [
        {
            source: 'about-jaw.md',
            target: 'octopus/Workbook Factory 개발자-동업자 액세스 체크리스트.md',
            raw: '\\[\\[Workbook Factory 개발자-동업자 액세스 체크리스트]]',
            status: 'resolved',
        },
        {
            source: 'about-jaw.md',
            target: 'Project Alpha.md',
            raw: '\\[\\[Project Alpha]]',
            status: 'resolved',
        },
    ]);
});
