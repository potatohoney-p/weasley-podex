import { parseArgs } from 'node:util';
import { DASHBOARD_DEFAULT_PORT } from '../../src/manager/constants.js';

function dashboardPort(): number {
    const fromEnv = Number(process.env["DASHBOARD_PORT"]);
    return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : Number(DASHBOARD_DEFAULT_PORT);
}

async function callDashboard<T>(path: string): Promise<T> {
    const port = dashboardPort();
    const url = `http://127.0.0.1:${port}/api/dashboard/memory${path}`;
    let res: Response;
    try {
        res = await fetch(url, { headers: { host: `127.0.0.1:${port}` } });
    } catch (err) {
        throw new Error(`dashboard unreachable at :${port} — run \`jaw dashboard serve\` first. (${(err as Error).message})`);
    }
    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`dashboard chat ${path} → ${res.status}: ${body.slice(0, 200)}`);
    }
    return res.json() as Promise<T>;
}

interface ChatHitResponse {
    id: number;
    role: string;
    content: string;
    cli: string | null;
    created_at: string;
    match_field: 'content' | 'tool_log';
    instanceId: string;
    instanceLabel: string | null;
}

interface ChatSearchResponse {
    hits: ChatHitResponse[];
    warnings: Array<{ instanceId: string; code: string; message: string }>;
    instancesQueried: number;
    instancesSucceeded: number;
}

function formatChatResult(data: ChatSearchResponse): string {
    const lines: string[] = [];
    lines.push(`# ${data.hits.length} hits across ${data.instancesSucceeded}/${data.instancesQueried} instances`);
    for (const hit of data.hits) {
        const label = hit.instanceLabel ? ` (${hit.instanceLabel})` : '';
        const field = hit.match_field === 'tool_log' ? ' [tool_log]' : '';
        lines.push(`\n[${hit.instanceId}${label}] ${hit.created_at} (${hit.role})${field}`);
        lines.push(hit.content.slice(0, 300));
    }
    if (data.warnings.length) {
        lines.push(`\n--- warnings ---`);
        for (const w of data.warnings) lines.push(`[${w.instanceId}] ${w.code}: ${w.message}`);
    }
    return lines.join('\n');
}

function printHelp(): void {
    console.log(`
  jaw dashboard chat — L2 cross-instance chat search (read-only)

  Usage:
    jaw dashboard chat search "<query>" [--instance <id,id>] [--limit N] [--days N]

  Options:
    --instance <ids>   comma-separated instance IDs to restrict the search
    --limit <N>        global result cap (max 200, default 50)
    --days <N>         limit to messages within the last N days
    --json             machine-readable JSON
    --port <port>      dashboard port (env DASHBOARD_PORT or default ${DASHBOARD_DEFAULT_PORT})

  Read-only. Searches jaw.db chat messages across all registered instances.
  Companion to \`jaw chat search\` (L1, instance-local).
`);
}

export async function handleDashboardChat(argvFromSwitch: string[]): Promise<void> {
    if (!argvFromSwitch.length || argvFromSwitch[0] === '--help' || argvFromSwitch[0] === '-h') {
        printHelp();
        return;
    }
    const sub = argvFromSwitch[0]!;
    const rest = argvFromSwitch.slice(1);
    const { values, positionals } = parseArgs({
        args: rest,
        options: {
            instance: { type: 'string' },
            limit: { type: 'string' },
            days: { type: 'string', short: 'd' },
            json: { type: 'boolean', default: false },
            port: { type: 'string' },
        },
        strict: false,
        allowPositionals: true,
    });
    if (values.port) process.env["DASHBOARD_PORT"] = String(values.port);

    try {
        switch (sub) {
            case 'search': {
                const q = positionals.join(' ').trim();
                if (!q) { console.error('  Usage: jaw dashboard chat search "<query>"'); process.exit(1); }
                const qs = new URLSearchParams({ q });
                if (values.instance) qs.set('instance', String(values.instance));
                if (values.limit) qs.set('limit', String(values.limit));
                if (values.days) qs.set('days', String(values.days));
                const result = await callDashboard<ChatSearchResponse>(`/chat/search?${qs.toString()}`);
                console.log(values.json ? JSON.stringify(result, null, 2) : formatChatResult(result));
                return;
            }
            default:
                console.error(`  Unknown subcommand: ${sub}`);
                printHelp();
                process.exit(1);
        }
    } catch (err) {
        console.error(`  ${(err as Error).message}`);
        process.exit(1);
    }
}
