import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const projectRoot = join(import.meta.dirname, '../..');
const projectCommandSrc = readFileSync(join(projectRoot, 'bin/commands/project.ts'), 'utf8');

test('project CLI reads projectDirs from standard { ok, data } settings responses', () => {
    assert.ok(projectCommandSrc.includes('const data = body["data"]'),
        'project CLI should inspect the standard response data envelope');
    assert.ok(projectCommandSrc.includes('body["projectDirs"] ?? data["projectDirs"]'),
        'project CLI should accept both legacy top-level and standard data.projectDirs shapes');
});
