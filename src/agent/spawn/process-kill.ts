import { execFileSync } from 'child_process';

/**
 * Recursively kill a process tree using pgrep -P.
 * Codex sub-agents spawn children with separate PGIDs,
 * so process.kill(-pid) won't reach them.
 */
export function killProcessTree(pid: number, signal: NodeJS.Signals = 'SIGTERM'): void {
    if (process.platform === 'win32') {
        try { execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* best effort */ }
        return;
    }
    let childPids: number[] = [];
    try {
        const out = execFileSync('pgrep', ['-P', String(pid)], { encoding: 'utf8', timeout: 3000 });
        childPids = out.trim().split('\n').filter(Boolean).map(Number).filter(n => n > 0);
    } catch { /* no children or pgrep failed */ }
    for (const cpid of childPids) {
        killProcessTree(cpid, signal);
    }
    try { process.kill(pid, signal); } catch { /* already dead */ }
}
