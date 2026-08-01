// bin/commands/history.ts — CLI: jaw history search "<query>" [--limit N]
import { loadSettings, getServerUrl } from '../../src/core/config.js';
import { cliFetch, getCliAuthToken } from '../../src/cli/api-auth.js';
import { shouldShowHelp, printAndExit } from '../helpers/help.js';
import { errString, isConnRefused } from '../_http-client.js';

if (shouldShowHelp(process.argv)) printAndExit(`
  jaw history search — search conversation history

  Usage: jaw history search "<query>" [--limit N]

  Searches past messages (user + assistant) by keyword.
  Default limit: 20, max: 50.
`);

loadSettings();

const args = process.argv.slice(3);
const sub = (args[0] || '').toLowerCase();

if (sub !== 'search') {
    console.error('Usage: jaw history search "<query>" [--limit N]');
    process.exit(1);
}

const rest = args.slice(1);
const limitIdx = rest.indexOf('--limit');
const limit = limitIdx >= 0 ? Number(rest[limitIdx + 1]) || 20 : 20;
const query = rest.filter((_, i) => i !== limitIdx && i !== limitIdx + 1).join(' ').trim();

if (!query) {
    console.error('Usage: jaw history search "<query>"');
    process.exit(1);
}

const PORT = undefined;
const BASE = getServerUrl(PORT);
await getCliAuthToken(PORT);

try {
    const res = await cliFetch(`${BASE}/api/messages/search?q=${encodeURIComponent(query)}&limit=${limit}`);
    const body = await res.json() as Record<string, unknown>;
    if (!res.ok) {
        console.error((body['error'] as string) || `Failed: ${res.status}`);
        process.exit(1);
    }
    const results = (body['data'] ?? body) as Array<Record<string, unknown>>;
    if (!Array.isArray(results) || results.length === 0) {
        console.log('No matches found.');
        process.exit(0);
    }
    for (const r of results) {
        const role = r['role'] === 'assistant' ? '🤖' : '👤';
        const date = String(r['created_at'] || '').slice(0, 16);
        const content = String(r['content'] || '').slice(0, 200).replace(/\n/g, ' ');
        console.log(`${role} [${date}] ${content}`);
    }
} catch (e) {
    if (isConnRefused(e)) {
        console.error('Server not running. Start with: jaw serve');
    } else {
        console.error(`Error: ${errString(e)}`);
    }
    process.exit(1);
}
