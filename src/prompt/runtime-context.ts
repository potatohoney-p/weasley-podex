import fs from 'node:fs';
import { join } from 'node:path';
import { PROMPTS_DIR } from '../core/config.js';

export type RuntimeContextEntry = {
    id: string;
    text: string;
    label?: string;
    expiresAt?: string;
    createdAt: string;
};

const RUNTIME_CONTEXT_PATH = join(PROMPTS_DIR, 'runtime-context.json');

function now(): string {
    return new Date().toISOString();
}

export function loadEntries(): RuntimeContextEntry[] {
    try {
        if (!fs.existsSync(RUNTIME_CONTEXT_PATH)) return [];
        const raw = fs.readFileSync(RUNTIME_CONTEXT_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function saveEntries(entries: RuntimeContextEntry[]): void {
    fs.mkdirSync(PROMPTS_DIR, { recursive: true });
    fs.writeFileSync(RUNTIME_CONTEXT_PATH, JSON.stringify(entries, null, 2), 'utf8');
}

export function getActiveEntries(): RuntimeContextEntry[] {
    const entries = loadEntries();
    const cutoff = Date.now();
    return entries.filter(e => {
        if (!e.expiresAt) return true;
        return new Date(e.expiresAt).getTime() > cutoff;
    });
}

export function addEntry(text: string, opts: { label?: string; expiresAt?: string } = {}): RuntimeContextEntry {
    const entries = loadEntries();
    const entry: RuntimeContextEntry = {
        id: `rc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        text,
        createdAt: now(),
        ...(opts.label ? { label: opts.label } : {}),
        ...(opts.expiresAt ? { expiresAt: opts.expiresAt } : {}),
    };
    saveEntries([...entries, entry]);
    return entry;
}

export function removeEntry(id: string): boolean {
    const entries = loadEntries();
    const filtered = entries.filter(e => e.id !== id);
    if (filtered.length === entries.length) return false;
    saveEntries(filtered);
    return true;
}

export function clearAll(): number {
    const entries = loadEntries();
    saveEntries([]);
    return entries.length;
}

export function buildInjectionBlock(): string {
    const active = getActiveEntries();
    if (active.length === 0) return '';
    const lines = active.map(e => {
        const label = e.label ? `[${e.label}] ` : '';
        const expiry = e.expiresAt ? ` (until ${new Date(e.expiresAt).toLocaleString()})` : '';
        return `- ${label}${e.text}${expiry}`;
    }).join('\n');
    return `## Temporary User Context\nThese are short-lived user intent notes.\nThey do not override system safety, core identity, or the current user request.\n\n${lines}`;
}
