import { execFile } from 'node:child_process';

export const GIT_OUTPUT_CAP = 1024 * 1024;

export function runGit(args: string[], cwd: string, allowExitCodes: number[] = [0]): Promise<string> {
    return new Promise((res, rej) => {
        execFile('git', args, { cwd, maxBuffer: GIT_OUTPUT_CAP, timeout: 30_000 }, (err, stdout, stderr) => {
            if (!err) {
                res(stdout);
                return;
            }
            const exitCode = typeof err.code === 'number' ? err.code : null;
            if (exitCode !== null && allowExitCodes.includes(exitCode)) {
                res(stdout);
                return;
            }
            rej(new Error(stderr.trim() || err.message));
        });
    });
}
