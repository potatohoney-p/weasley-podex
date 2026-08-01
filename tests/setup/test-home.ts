import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

const TEST_HOME_PREFIX = 'podex-test-';

const inheritedHome = process.env.WEASLEY_PODEX_HOME || '';
const testHome = mkdtempSync(join(tmpdir(), TEST_HOME_PREFIX));

process.env.WEASLEY_PODEX_INHERITED_HOME = inheritedHome;
process.env.WEASLEY_PODEX_HOME = testHome;
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

if (!basename(process.env.WEASLEY_PODEX_HOME).startsWith(TEST_HOME_PREFIX)) {
    throw new Error(`Refusing to run tests because effective WEASLEY_PODEX_HOME is not a temp test home: ${process.env.WEASLEY_PODEX_HOME}`);
}

