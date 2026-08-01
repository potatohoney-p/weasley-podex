#!/usr/bin/env node
// bin/commands/project.ts — CLI: jaw project [set|reset|clear|list]

import { loadSettings, getServerUrl, setProjectDirs, clearProjectDirs, getProjectDirs } from '../../src/core/config.js';
import { cliFetch, getCliAuthToken } from '../../src/cli/api-auth.js';
import { resolveHomePath } from '../../src/core/path-expand.js';
import { shouldShowHelp, printAndExit } from '../helpers/help.js';
import { errString, isConnRefused } from '../_http-client.js';
import fs from 'node:fs';
import path from 'node:path';

if (shouldShowHelp(process.argv)) printAndExit(`
  jaw project — manage project workspace directories

  Usage: jaw project <subcommand> [paths...]

  Subcommands:
    set <path>[, <path>...]   Set active project directories (comma-separated)
    reset                     Clear all project directories
    clear                     Alias for reset
    list                      Show current project directories (default)

  Examples:
    jaw project set ~/Dev/frontend, ~/Dev/backend
    jaw project set /absolute/path/to/project
    jaw project reset
    jaw project list
`);

loadSettings();

const sub = (process.argv[3] || 'list').toLowerCase();
const rest = process.argv.slice(4).join(' ');
const portIdx = process.argv.indexOf('--port');
const PORT = portIdx !== -1 ? process.argv[portIdx + 1] : undefined;
const BASE = getServerUrl(PORT);

async function applyViaServer(patch: Record<string, unknown>): Promise<Record<string, unknown>> {
    await getCliAuthToken(PORT);
    const res = await cliFetch(`${BASE}/api/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
    });
    const body = await res.json() as Record<string, unknown>;
    if (!res.ok) throw new Error((body["error"] as string) || `HTTP ${res.status}`);
    return body;
}

function parsePaths(input: string): string[] {
    const raw = input.split(',').map(s => s.trim()).filter(Boolean);
    if (raw.length === 0) {
        console.error('  ❌ No paths specified. Usage: jaw project set <path>[, <path>...]');
        process.exit(1);
    }
    const resolved: string[] = [];
    for (const p of raw) {
        const abs = resolveHomePath(p);
        if (!path.isAbsolute(abs)) {
            console.error(`  ❌ Absolute paths only: ${p}`);
            process.exit(1);
        }
        if (!fs.existsSync(abs)) {
            console.warn(`  ⚠ Path does not exist: ${abs}`);
        }
        resolved.push(abs);
    }
    return [...new Set(resolved)];
}

function readProjectDirsFromBody(body: Record<string, unknown>): string[] | null {
    const data = body["data"] && typeof body["data"] === 'object'
        ? body["data"] as Record<string, unknown>
        : {};
    const raw = body["projectDirs"] ?? data["projectDirs"];
    if (!Array.isArray(raw)) return null;
    const valid = raw.filter((d): d is string => typeof d === 'string' && d.trim().length > 0);
    return valid.length > 0 ? valid : null;
}

function printDirs(dirs: string[] | null): void {
    if (!dirs || dirs.length === 0) {
        console.log('No active project directories.');
    } else {
        console.log('Active project directories:');
        dirs.forEach(d => console.log(`   ${d}`));
    }
}

async function runViaServer(): Promise<boolean> {
    try {
        switch (sub) {
            case 'set': {
                const dirs = parsePaths(rest);
                const body = await applyViaServer({ projectDirs: dirs });
                const applied = readProjectDirsFromBody(body);
                if (!applied || applied.length === 0) {
                    console.error('❌ All paths were rejected during normalization. No project directories set.');
                    process.exitCode = 1;
                } else {
                    console.log(`✅ projectDirs set:`);
                    applied.forEach(d => console.log(`   ${d}`));
                    const rejected = dirs.length - applied.length;
                    if (rejected > 0) console.warn(`⚠ ${rejected} path(s) were rejected during normalization.`);
                }
                return true;
            }
            case 'reset':
            case 'clear': {
                await applyViaServer({ projectDirs: null });
                console.log('✅ projectDirs cleared');
                return true;
            }
            case 'list':
            default: {
                await getCliAuthToken(PORT);
                const res = await cliFetch(`${BASE}/api/settings`);
                const body = await res.json() as Record<string, unknown>;
                printDirs(readProjectDirsFromBody(body));
                return true;
            }
        }
    } catch (e: unknown) {
        if (isConnRefused(e)) return false;
        throw e;
    }
}

function runViaFile(): void {
    switch (sub) {
        case 'set': {
            const dirs = parsePaths(rest);
            setProjectDirs(dirs);
            const applied = getProjectDirs();
            if (!applied || applied.length === 0) {
                console.error('❌ All paths were rejected during normalization. No project directories set.');
                process.exitCode = 1;
            } else {
                console.log(`✅ projectDirs set (file-only, server not running):`);
                applied.forEach(d => console.log(`   ${d}`));
                const rejected = dirs.length - applied.length;
                if (rejected > 0) console.warn(`⚠ ${rejected} path(s) were rejected during normalization.`);
            }
            break;
        }
        case 'reset':
        case 'clear': {
            clearProjectDirs();
            console.log('✅ projectDirs cleared (file-only, server not running)');
            break;
        }
        case 'list':
        default: {
            printDirs(getProjectDirs());
            break;
        }
    }
}

try {
    const handled = await runViaServer();
    if (!handled) {
        console.warn(`⚠ Server not running — using file-only mode.`);
        runViaFile();
    }
} catch (e: unknown) {
    console.error(`Error: ${errString(e)}`);
    process.exit(1);
}
