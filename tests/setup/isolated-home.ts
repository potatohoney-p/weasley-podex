// Per-file DB isolation for tests that perform GLOBAL, destructive sweeps over
// shared tables (e.g. recoverBgTasks → loadRecoverable selects ALL running rows).
//
// tests/run.mts runs files with `isolation:'process'` but every child inherits the
// SAME podex_HOME from the parent (set once in tests/setup/test-home.ts), so they
// all share one jaw.db. A test that calls recoverBgTasks with a stubbed isAlive
// (which declares every foreign PID dead) would then clobber in-flight rows owned
// by OTHER concurrently-running test processes — a cross-process race.
//
// Importing THIS module FIRST (before any DB-touching import) gives the file its own
// podex_HOME, so its global sweep only ever sees its own rows. ESM evaluates an
// imported module's side effects before the importer's later imports, so the override
// lands before src/core/config.ts binds DB_PATH. (A bare top-level assignment in the
// test file would be too late: import hoisting evaluates `import { db }` first.)
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

const ISOLATED_HOME_PREFIX = 'podex-test-iso-';
process.env.podex_HOME = mkdtempSync(join(tmpdir(), ISOLATED_HOME_PREFIX));
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

if (!basename(process.env.podex_HOME).startsWith(ISOLATED_HOME_PREFIX)) {
    throw new Error(`Refusing to run: isolated podex_HOME is not a temp test home: ${process.env.podex_HOME}`);
}

