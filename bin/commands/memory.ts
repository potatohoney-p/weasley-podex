/**
 * weasley-podex memory — persistent memory CLI
 */
import { parseArgs } from 'node:util';
import { getServerUrl, WEASLEY_PODEX_HOME, loadSettings } from '../../src/core/config.js';
import { getCliAuthToken, authHeaders } from '../../src/cli/api-auth.js';
import { asArray, asRecord, fieldString, type JsonRecord } from '../_http-client.js';

loadSettings();
const SERVER = getServerUrl();
await getCliAuthToken();
const sub = process.argv[3];

interface MemoryFileEntry {
    path: string;
    size: number;
    modified: string;
}

async function api<T = JsonRecord>(method: string, path: string, body?: unknown): Promise<T> {
    const opts: RequestInit = { method, headers: { ...authHeaders(), 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const resp = await fetch(`${SERVER}/api/jaw-memory${path}`, opts);
    if (!resp.ok) {
        const err = asRecord(await resp.json().catch(() => ({ error: resp.statusText })));
        throw new Error(fieldString(err["error"]) || `HTTP ${resp.status}`);
    }
    return await resp.json() as T;
}

try {
    switch (sub) {
        case 'search': {
            const hasChat = process.argv.includes('--chat');
            const queryArgs = process.argv.slice(4).filter(a => a !== '--chat');
            const query = queryArgs.join(' ');
            if (!query) { console.error('Usage: weasley-podex memory search <query> [--chat]'); process.exit(1); }
            const r = await api<{ result?: string }>('GET', `/search?q=${encodeURIComponent(query)}`);
            console.log(r.result);
            if (hasChat) {
                try {
                    const chatParams = new URLSearchParams({ q: query, days: '7', limit: '10' });
                    const chatResp = await fetch(`${SERVER}/api/messages/search?${chatParams}`, {
                        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
                    });
                    if (chatResp.ok) {
                        const chatBody = await chatResp.json() as Record<string, unknown>;
                        const chatData = (Array.isArray(chatBody) ? chatBody : Array.isArray(chatBody['data']) ? chatBody['data'] : []) as Array<Record<string, unknown>>;
                        if (chatData.length > 0) {
                            console.log('\n[chat history — last 7 days]');
                            for (const m of chatData) {
                                console.log(`  [${m['created_at']}] (${m['role']}) ${String(m['content'] || '').slice(0, 200)}`);
                            }
                        }
                    }
                } catch { /* chat search is best-effort */ }
            }
            break;
        }
        case 'read': {
            const file = process.argv[4];
            if (!file) { console.error('Usage: weasley-podex memory read <file>'); process.exit(1); }
            const { values } = parseArgs({
                args: process.argv.slice(5),
                options: { lines: { type: 'string' } }, strict: false
            });
            const params = new URLSearchParams({ file });
            if (values.lines) params.set('lines', values.lines as string);
            const r = await api<{ content?: string | null }>('GET', `/read?${params}`);
            if (r.content === null) console.error(`❌ File not found: ${file}`);
            else console.log(r.content);
            break;
        }
        case 'save': {
            const file = process.argv[4];
            const content = process.argv.slice(5).join(' ');
            if (!file || !content) {
                console.error([
                    'Usage: weasley-podex memory save <file> <content>',
                    'Examples:',
                    '  weasley-podex memory save structured/profile.md "- User prefers concise Korean summaries"',
                    '  weasley-podex memory save structured/semantic/podex.md "- weasley-podex memory save requires an explicit file path"',
                    '  weasley-podex memory save structured/episodes/live/2026-04-26.md "## 10:20\\n- Completed help dialog refinement"',
                ].join('\n'));
                process.exit(1);
            }
            const r = await api<{ path?: string }>('POST', '/save', { file, content });
            console.log(`✅ Saved to ${r.path}`);
            break;
        }
        case 'list': {
            const r = await api<{ files?: MemoryFileEntry[] }>('GET', '/list');
            const files = asArray<MemoryFileEntry>(r.files);
            if (files.length === 0) {
                console.log('(no memory files — run: weasley-podex memory init)');
            } else {
                for (const f of files) {
                    const kb = (f.size / 1024).toFixed(1);
                    console.log(`  ${f.path.padEnd(30)} ${kb} KB  ${f.modified.slice(0, 10)}`);
                }
            }
            break;
        }
        case 'init': {
            await api('POST', '/init', {});
            console.log(`🧠 Memory initialized at ${WEASLEY_PODEX_HOME}/memory/`);
            break;
        }
        case 'reflect': {
            const { values: reflectValues } = parseArgs({
                args: process.argv.slice(4),
                options: {
                    sinceDays: { type: 'string', default: '7' },
                    dryRun: { type: 'boolean', default: false },
                },
                strict: false,
            });
            const r = await api('POST', '/reflect', {
                sinceDays: Number(reflectValues.sinceDays) || 7,
                dryRun: reflectValues.dryRun === true,
            });
            console.log(JSON.stringify(r, null, 2));
            break;
        }
        case 'flush': {
            const r = await api<{ message?: string }>('POST', '/flush', {});
            console.log(`🧠 ${r.message || 'Memory flush triggered'}`);
            break;
        }
        case 'context': {
            const file = process.argv[4];
            if (!file) { console.error('Usage: weasley-podex memory context <file> [--window N]'); process.exit(1); }
            const { values: ctxValues } = parseArgs({
                args: process.argv.slice(5),
                options: { window: { type: 'string', default: '4' }, limit: { type: 'string', default: '10' } },
                strict: false,
            });
            const params = new URLSearchParams({ file });
            if (ctxValues.window) params.set('window', ctxValues.window as string);
            if (ctxValues.limit) params.set('limit', ctxValues.limit as string);
            const r = await api<{ file?: string; center?: string; terms?: { q: string; q2: string | null }; hits?: Array<{ id: number; role: string; content: string; cli: string | null; created_at: string; session_id: string }>; message?: string }>('GET', `/context?${params}`);
            if (r.message) { console.log(r.message); break; }
            console.log(`# Memory: ${r.file}  (center: ${r.center})`);
            console.log(`# Terms: q="${r.terms?.q}" q2="${r.terms?.q2 || ''}"`);
            const hits = r.hits || [];
            if (!hits.length) { console.log('(no related chat messages found)'); break; }
            for (const h of hits) {
                console.log(`\n[${h.created_at}] (${h.role}) session:${h.session_id}`);
                console.log(h.content);
            }
            break;
        }
        case 'cleanup': {
            const { values: cleanupValues } = parseArgs({
                args: process.argv.slice(4),
                options: { days: { type: 'string', default: '90' } },
                strict: false,
            });
            const r = await api<{ moved?: number }>('POST', '/cleanup', { retentionDays: parseInt(cleanupValues.days as string || '90') });
            console.log(`🧠 Archived ${r.moved ?? 0} episodes`);
            break;
        }
        default:
            console.log(`
  🧠 weasley-podex memory

  Commands:
    search <query>               Search all memory files (grep)
    read <file> [--lines N-M]    Read a memory file
    save <file> <content>        Append content to a memory file
    list                         List all memory files
    init                         Initialize memory directory
    context <file> [--window N]   Find chat messages around a memory file's creation time
    reflect [--sinceDays N]      Promote durable facts from episodes to shared pages
    flush                        Manually trigger memory flush
    cleanup [--days N]           Archive episodes older than N days (default: 90)

  Files:
    MEMORY.md          Core knowledge (auto-injected into prompt)
    preferences.md     User preferences
    decisions.md       Key decisions with dates
    people.md          People and teams
    projects/<name>.md Per-project notes
    daily/<date>.md    Auto-generated session logs

  Cross-instance (L2):
    weasley-podex dashboard memory search <query>   Search across all instances
    weasley-podex dashboard memory read <file>      Read from a specific instance
    weasley-podex dashboard memory instances        List available instances
`);
    }
} catch (e) {
    console.error(`❌ ${(e as Error).message}`);
    process.exitCode = 1;
}

