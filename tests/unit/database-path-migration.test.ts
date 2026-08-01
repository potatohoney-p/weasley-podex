import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('legacy database and SQLite sidecars migrate to weasley-podex.db without overwrite', async () => {
    const home = mkdtempSync(join(tmpdir(), 'weasley-podex-db-migration-'));
    const previousHome = process.env.WEASLEY_PODEX_HOME;
    process.env.WEASLEY_PODEX_HOME = home;

    try {
        writeFileSync(join(home, 'jaw.db'), 'legacy-database');
        writeFileSync(join(home, 'jaw.db-wal'), 'legacy-wal');
        writeFileSync(join(home, 'jaw.db-shm'), 'legacy-shm');

        const config = await import('../../src/core/config.ts?database-path-migration');
        assert.equal(config.DB_PATH, join(home, 'weasley-podex.db'));
        assert.equal(config.migrateLegacyDatabaseFile(), true);
        assert.equal(readFileSync(config.DB_PATH, 'utf8'), 'legacy-database');
        assert.equal(readFileSync(`${config.DB_PATH}-wal`, 'utf8'), 'legacy-wal');
        assert.equal(readFileSync(`${config.DB_PATH}-shm`, 'utf8'), 'legacy-shm');
        assert.equal(existsSync(join(home, 'jaw.db')), false);

        writeFileSync(join(home, 'jaw.db'), 'must-not-overwrite');
        assert.equal(config.migrateLegacyDatabaseFile(), false);
        assert.equal(readFileSync(config.DB_PATH, 'utf8'), 'legacy-database');
        assert.equal(readFileSync(join(home, 'jaw.db'), 'utf8'), 'must-not-overwrite');
    } finally {
        if (previousHome === undefined) delete process.env.WEASLEY_PODEX_HOME;
        else process.env.WEASLEY_PODEX_HOME = previousHome;
        rmSync(home, { recursive: true, force: true });
    }
});
