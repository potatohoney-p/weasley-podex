import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { collectInventory, countDirectory } from '../../scripts/docs/count-inventory.mjs';

const repository = resolve(import.meta.dirname, '../..');
function fixture(t: { after: (cleanup: () => void) => void }) {
    const root = mkdtempSync(join(tmpdir(), 'podex counts '));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    function write(path: string, content: string | Uint8Array = '') {
        mkdirSync(resolve(root, path, '..'), { recursive: true });
        writeFileSync(join(root, path), content);
    }
    for (const directory of ['public', 'src', 'tests', 'bin/commands']) {
        mkdirSync(join(root, directory), { recursive: true });
    }
    return { root, write };
}

test('inventory includes every long path with spaces and counts LF bytes exactly', t => {
    const { root, write } = fixture(t);
    // Combined file names exceed Windows' single process command-line limit.
    for (let i = 0; i < 600; i += 1) {
        write(`public/assets with spaces/${String(i).padStart(3, '0')}-${'x'.repeat(80)}.txt`, 'a\r\nb\nunterminated');
    }
    write('public/empty');
    write('public/binary', new Uint8Array([0, 10, 255, 10]));
    write('public/dist/bundle.js', '\n'.repeat(900));
    write('public/public/dist/bundle.js', '\n'.repeat(800));
    write('public/assets with spaces/.DS_Store', '\n'.repeat(700));
    write('public/public/keep.txt', 'keep\n');
    write('src/top.ts');
    write('src/one/nested/file.ts');
    write('src/two/file.ts');
    write('tests/unit/example.test.ts');
    write('bin/commands/example.ts');
    assert.deepEqual(collectInventory(root), {
        publicLines: 1203, publicFiles: 603, sourceFiles: 3,
        sourceDirectories: 2, testFiles: 1, commandFiles: 1, publicDistFiles: 1,
    });
});

test('only an explicitly optional missing directory becomes an empty inventory', t => {
    const { root, write } = fixture(t);
    assert.equal(collectInventory(root).publicDistFiles, 0);
    assert.throws(() => countDirectory(join(root, 'missing')), { code: 'ENOENT' });
    write('not a directory');
    assert.throws(() => countDirectory(join(root, 'not a directory'), { optional: true }));
});

test('real count checker passes clean checkout and rejects actual aggregate drift', t => {
    const { root, write } = fixture(t);
    write('public/a file.txt', 'one\ntwo\n');
    write('src/core/example.ts');
    write('tests/unit/example.test.ts');
    write('bin/commands/example.ts');
    const doc = [
        '├── public/ ← Web UI (1 files source/assets, ~2L)',
        '> server.ts 0L / src 1 files / top-level module dirs 1 / tests 1 files / public tree 1 files',
        '│   └── commands/ ← 1 files',
        'public/dist build output 0 files',
    ].join('\n');
    write('structure/str_func.md', doc);
    write('scripts/docs/.keep');
    copyFileSync(join(repository, 'scripts/docs/count-inventory.mjs'), join(root, 'scripts/docs/count-inventory.mjs'));
    copyFileSync(join(repository, 'structure/verify-counts.sh'), join(root, 'structure/verify-counts.sh'));
    const check = () => spawnSync('bash', ['structure/verify-counts.sh'], {
        cwd: root, encoding: 'utf8', timeout: 30_000,
    });
    const valid = check();
    assert.equal(valid.status, 0, `${valid.error ?? ''}\n${valid.stdout}\n${valid.stderr}`);
    assert.match(valid.stdout, /ALL PASS/);
    write('structure/str_func.md', doc.replace('~2L', '~500L'));
    const drift = check();
    assert.equal(drift.status, 1, `${drift.error ?? ''}\n${drift.stdout}\n${drift.stderr}`);
    assert.match(drift.stdout, /public\/ total.*~500L.*2L/);
    write('structure/str_func.md', doc.replace('build output 0 files', 'build output 1 files'));
    const missingBuild = check();
    assert.equal(missingBuild.status, 1, `${missingBuild.error ?? ''}\n${missingBuild.stdout}\n${missingBuild.stderr}`);
    assert.match(missingBuild.stdout, /public\/dist files/);
});
