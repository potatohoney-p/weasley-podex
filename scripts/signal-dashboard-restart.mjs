import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readlinkSync } from 'node:fs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const managerMarkers = [
    'dist/src/manager/server.js',
    'src/manager/server.ts',
];

function run(command, args) {
    try {
        return execFileSync(command, args, {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        });
    } catch {
        return '';
    }
}

function parseProcessRows(output) {
    return output
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => {
            const match = line.match(/^(\d+)\s+(.+)$/);
            if (!match) return null;
            return { pid: Number(match[1]), command: match[2] };
        })
        .filter(row => row && Number.isFinite(row.pid));
}

function isManagerCommand(command) {
    return managerMarkers.some(marker => command.includes(marker));
}

function cwdFromProc(pid) {
    try {
        return resolve(readlinkSync(`/proc/${pid}/cwd`));
    } catch {
        return null;
    }
}

function cwdFromLsof(pid) {
    const output = run('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn']);
    const cwdLine = output.split('\n').find(line => line.startsWith('n'));
    return cwdLine ? resolve(cwdLine.slice(1)) : null;
}

function processBelongsToRepo({ pid, command }) {
    if (command.includes(repoRoot)) return true;
    const cwd = cwdFromProc(pid) || cwdFromLsof(pid);
    return cwd === repoRoot;
}

const rows = parseProcessRows(run('ps', ['-axo', 'pid=,command=']));
let signaled = 0;

for (const row of rows) {
    if (!row || !isManagerCommand(row.command)) continue;
    if (!processBelongsToRepo(row)) continue;
    try {
        process.kill(row.pid, 'SIGUSR2');
        signaled += 1;
        console.log(`[jaw:restart] SIGUSR2 -> pid ${row.pid}`);
    } catch {
        // Process exited between ps and signal.
    }
}

if (signaled === 0) {
    console.log('[jaw:restart] no running dashboard — skip');
}
