import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findAtMentionMatch, listRepoFiles } from '../../src/cli/tui/file-mention.ts';

test('findAtMentionMatch detects an @ token under the cursor', () => {
    const text = 'hello @src/cl';
    const m = findAtMentionMatch(text, text.length);
    assert.ok(m);
    assert.equal(m!.query, 'src/cl');
    assert.equal(m!.replaceStart, 6);
});

test('findAtMentionMatch ignores @ inside a word', () => {
    assert.equal(findAtMentionMatch('foo@bar', 7), null);
});

test('listRepoFiles returns matching paths from a temp repo', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jaw-mention-'));
    try {
        fs.mkdirSync(path.join(root, 'src', 'cli'), { recursive: true });
        fs.writeFileSync(path.join(root, 'src', 'cli', 'chat.ts'), 'export {}');
        const items = listRepoFiles(root, 'chat', 10);
        assert.ok(items.some((i) => i.name.endsWith('chat.ts')));
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
