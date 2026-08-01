import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

const TEST_HOME_PREFIX = 'podex-test-';

const inheritedHome = process.env.podex_HOME || '';
const testHome = mkdtempSync(join(tmpdir(), TEST_HOME_PREFIX));

process.env.podex_INHERITED_HOME = inheritedHome;
process.env.podex_HOME = testHome;
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

if (!basename(process.env.podex_HOME).startsWith(TEST_HOME_PREFIX)) {
    throw new Error(`Refusing to run tests because effective podex_HOME is not a temp test home: ${process.env.podex_HOME}`);
}

