import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
for (const gate of ['observe-actions-fixtures', 'observation-bundle-fixtures', 'browser-primitives-catalog', 'action-memory-safe-replay']) {
    test(`release gate launches the real ${gate} fixture with the current Node runtime`, () => {
        const result = spawnSync(process.execPath, ['scripts/release-gates.mjs', gate], {
            cwd: root, encoding: 'utf8', timeout: 30_000,
        });
        assert.equal(result.status, 0, `${result.error ?? ''}\n${result.stdout}\n${result.stderr}`);
        assert.match(result.stdout, new RegExp(`\\[PASS\\] gate:${gate}`));
    });
}
test('docs CLI executes its inventory checks and emits JSON on every platform', () => {
    const result = spawnSync(process.execPath, [
        'node_modules/tsx/dist/cli.mjs', 'scripts/docs/check-docs.mts', '--json',
    ], { cwd: root, encoding: 'utf8', timeout: 30_000 });
    assert.equal(result.status, 0, `${result.error ?? ''}\n${result.stdout}\n${result.stderr}`);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, true);
    assert.deepEqual(report.issues, []);
});
