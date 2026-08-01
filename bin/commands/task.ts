#!/usr/bin/env node
// bin/commands/task.ts — CLI: jaw task [add|done|start|assign|cancel|list|clear]
import { loadSettings, getServerUrl } from '../../src/core/config.js';
import { cliFetch, getCliAuthToken } from '../../src/cli/api-auth.js';
import { shouldShowHelp, printAndExit } from '../helpers/help.js';

interface TaskItem { id: string; content: string; status: string; owner?: string; after?: string }
interface TaskResponse { ok: boolean; error?: string; task: TaskItem; removed?: number; tasks?: TaskItem[] }

if (shouldShowHelp(process.argv)) printAndExit(`
  jaw task — Task checklist

  Usage: jaw task <subcommand> [args...]

  Subcommands:
    add <content> [--owner Name] [--after id]   Add a task
    done <id>                                   Mark task done
    start <id>                                  Mark task in progress
    assign <id> <owner>                         Assign to employee
    edit <id> <new content>                      Edit task content
    cancel <id>                                 Cancel a task
    list [--status pending|done] [--owner Name] List tasks
    clear                                       Remove done/cancelled tasks

  Examples:
    jaw task add "Implement auth module"
    jaw task add "Write tests" --owner Backend --after abc12345
    jaw task done abc12345
    jaw task list
    jaw task clear
`);

loadSettings();

const args = process.argv.slice(3);
const sub = (args[0] || 'list').toLowerCase();

const PORT = undefined;
const BASE = getServerUrl(PORT);
await getCliAuthToken(PORT);

try {
    switch (sub) {
        case 'add': {
            const rest = args.slice(1);
            let owner: string | undefined;
            let after: string | undefined;
            const filtered: string[] = [];
            for (let i = 0; i < rest.length; i++) {
                if (rest[i] === '--owner' && rest[i + 1]) { owner = rest[++i]; break; }
                if (rest[i] === '--after' && rest[i + 1]) { after = rest[++i]; break; }
                filtered.push(rest[i]!);
            }
            for (let i = rest.indexOf(owner || '') + 1; i < rest.length && i > 0; i++) {
                if (rest[i] === '--owner' && rest[i + 1]) { owner = rest[++i]; continue; }
                if (rest[i] === '--after' && rest[i + 1]) { after = rest[++i]; continue; }
                filtered.push(rest[i]!);
            }
            const content = filtered.join(' ').trim();
            if (!content) { console.error('Usage: jaw task add <content>'); process.exit(1); }
            const body: Record<string, string> = { action: 'add', content };
            if (owner) body['owner'] = owner;
            if (after) body['after'] = after;
            const res = await cliFetch(`${BASE}/api/task`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            const data = await res.json() as TaskResponse;
            if (!data.ok) { console.error(data.error || 'Failed'); process.exit(1); }
            const t = data.task;
            console.log(`Added: [${t.id}] ${t.content}${t.owner ? ` @${t.owner}` : ''}${t.after ? ` (after:${t.after})` : ''}`);
            break;
        }
        case 'edit': {
            const id = args[1];
            const content = args.slice(2).join(' ').trim();
            if (!id || !content) { console.error('Usage: jaw task edit <id> <new content>'); process.exit(1); }
            const res = await cliFetch(`${BASE}/api/task`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'update', id, content }) });
            const data = await res.json() as TaskResponse;
            if (!data.ok) { console.error(data.error || 'Failed'); process.exit(1); }
            console.log(`Edited: [${data.task.id}] ${data.task.content}`);
            break;
        }
        case 'done':
        case 'start':
        case 'cancel': {
            const id = args[1];
            if (!id) { console.error(`Usage: jaw task ${sub} <id>`); process.exit(1); }
            const status = sub === 'done' ? 'done' : sub === 'start' ? 'in_progress' : 'cancelled';
            const res = await cliFetch(`${BASE}/api/task`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'update', id, status }) });
            const data = await res.json() as TaskResponse;
            if (!data.ok) { console.error(data.error || 'Failed'); process.exit(1); }
            const mark = status === 'done' ? 'Done' : status === 'in_progress' ? 'Started' : 'Cancelled';
            console.log(`${mark}: [${data.task.id}] ${data.task.content}`);
            break;
        }
        case 'assign': {
            const id = args[1];
            const owner = args[2];
            if (!id || !owner) { console.error('Usage: jaw task assign <id> <owner>'); process.exit(1); }
            const res = await cliFetch(`${BASE}/api/task`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'update', id, owner }) });
            const data = await res.json() as TaskResponse;
            if (!data.ok) { console.error(data.error || 'Failed'); process.exit(1); }
            console.log(`Assigned: [${id}] → ${owner}`);
            break;
        }
        case 'list': {
            const params = new URLSearchParams();
            for (let i = 1; i < args.length; i++) {
                if (args[i] === '--status' && args[i + 1]) { params.set('status', args[++i]!); }
                if (args[i] === '--owner' && args[i + 1]) { params.set('owner', args[++i]!); }
            }
            const qs = params.toString() ? `?${params}` : '';
            const res = await cliFetch(`${BASE}/api/task${qs}`);
            const data = await res.json() as TaskResponse;
            if (!data.tasks?.length) { console.log('No tasks.'); break; }
            const markers: Record<string, string> = { pending: '○', in_progress: '▶', done: '✓', cancelled: '✗' };
            for (const t of data.tasks) {
                const mark = markers[t.status] || '?';
                const owner = t.owner ? ` @${t.owner}` : '';
                const dep = t.after ? ` (after:${t.after})` : '';
                console.log(`${mark} [${t.id}] ${t.content}${owner}${dep}`);
            }
            break;
        }
        case 'clear': {
            const res = await cliFetch(`${BASE}/api/task`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'clear' }) });
            const data = await res.json() as TaskResponse;
            console.log((data.removed ?? 0) > 0 ? `Cleared ${data.removed} done/cancelled tasks.` : 'Nothing to clear.');
            break;
        }
        default:
            console.error(`Unknown subcommand: ${sub}`);
            console.error('Usage: jaw task [add|edit|done|start|assign|cancel|list|clear]');
            process.exit(1);
    }
} catch (e: unknown) {
    const err = e as Error & { cause?: { code?: string } };
    if (err?.cause?.code === 'ECONNREFUSED') {
        console.error('  ❌ jaw server not running. Start with: jaw serve');
        process.exit(1);
    }
    console.error('Error:', err.message || e);
    process.exit(1);
}
