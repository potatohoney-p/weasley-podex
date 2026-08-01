/**
 * weasley-podex lock — Instance lock/unlock for process protection
 * Usage:
 *   weasley-podex lock [--port 3457]           Lock instance (protect from stopAll)
 *   weasley-podex unlock [--port 3457]         Unlock instance
 *   weasley-podex lock status [--port 3457]    Show lock status
 */
import { parseArgs } from 'node:util';
import { getServerUrl } from '../../src/core/config.js';
import { getCliAuthToken, authHeaders } from '../../src/cli/api-auth.js';

const sub = String(process.argv[3] || '').toLowerCase();
const isUnlock = process.argv[2] === 'unlock';
const { values } = parseArgs({
    args: process.argv.slice(sub === 'status' || sub === '--help' || sub === '-h' ? 4 : 3),
    options: {
        port: { type: 'string', default: process.env['PORT'] || '3457' },
        help: { type: 'boolean', default: false },
    },
    strict: false,
});

function printHelp() {
    console.log(`
  Usage:
    weasley-podex lock [--port 3457]           Lock instance (protect from stopAll)
    weasley-podex unlock [--port 3457]         Unlock instance
    weasley-podex lock status [--port 3457]    Show lock status

  Description:
    Lock protects a running instance from being killed during manager shutdown.
    Protected instances are skipped by stopAll('locked-skip').
`);
}

if (values.help || sub === '--help' || sub === '-h' || sub === 'help') {
    printHelp();
    process.exit(0);
}

const port = values.port as string;
const baseUrl = getServerUrl(port);
await getCliAuthToken(port);

async function apiCall(path: string, method = 'GET', body?: unknown): Promise<Record<string, unknown>> {
    const headers: Record<string, string> = { ...authHeaders() };
    const init: RequestInit = { method, headers, signal: AbortSignal.timeout(10000) };
    if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(body);
    }
    init.headers = headers;
    const res = await fetch(baseUrl + path, init);
    const text = await res.text();
    try { return JSON.parse(text) as Record<string, unknown>; } catch { return { raw: text }; }
}

if (sub === 'status') {
    try {
        const result = await apiCall('/api/instance/lock');
        if (result['protected']) {
            console.log(`🔒 Port ${port} is protected`);
        } else {
            console.log(`🔓 Port ${port} is not protected`);
        }
    } catch (err) {
        console.error(`❌ Failed to check lock status: ${(err as Error).message}`);
        process.exitCode = 1;
    }
} else if (isUnlock) {
    try {
        const result = await apiCall('/api/instance/lock', 'DELETE');
        if (result['ok']) {
            console.log(`🔓 Port ${port} unlocked`);
        } else {
            console.error(`❌ Unlock failed: ${result['error'] || 'unknown'}`);
            process.exitCode = 1;
        }
    } catch (err) {
        console.error(`❌ Failed to unlock: ${(err as Error).message}`);
        process.exitCode = 1;
    }
} else {
    try {
        const result = await apiCall('/api/instance/lock', 'POST');
        if (result['ok']) {
            console.log(`🔒 Port ${port} locked (protected from stopAll)`);
        } else {
            console.error(`❌ Lock failed: ${result['error'] || 'unknown'}`);
            process.exitCode = 1;
        }
    } catch (err) {
        console.error(`❌ Failed to lock: ${(err as Error).message}`);
        process.exitCode = 1;
    }
}

