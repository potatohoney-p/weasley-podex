import { getWeasleyPodexEnv } from '../../core/weasley-podex-env.js';
import { mkdir, rename } from 'node:fs/promises';
import { basename, join } from 'node:path';
import trash from 'trash';

export async function moveToSystemTrash(paths: string[]): Promise<void> {
    const testTrashDir = getWeasleyPodexEnv('TEST_SYSTEM_TRASH_DIR');
    if (process.env["NODE_ENV"] === 'test' && testTrashDir) {
        if (getWeasleyPodexEnv('TEST_SYSTEM_TRASH_FAIL') === '1') {
            throw new Error('Simulated system trash failure');
        }
        await mkdir(testTrashDir, { recursive: true });
        const prefix = `${Date.now()}_`;
        for (const path of paths) {
            await rename(path, join(testTrashDir, `${prefix}${basename(path)}`));
        }
        return;
    }

    await trash(paths, { glob: false });
}
