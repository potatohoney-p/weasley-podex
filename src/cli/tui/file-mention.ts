/**
 * @-file fuzzy mention popup for the TUI composer (Phase 3, doc 08).
 */
import fs from 'node:fs';
import path from 'node:path';
import type { OverlayItem } from '../types.js';

const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', '.next', 'coverage', 'tmp']);

export interface AtMentionMatch {
    query: string;
    /** Character index in the trailing text segment where `@` starts. */
    replaceStart: number;
}

/** Return the active `@`-mention token under the cursor, if any. */
export function findAtMentionMatch(trailingText: string, cursor: number): AtMentionMatch | null {
    const before = trailingText.slice(0, Math.max(0, Math.min(cursor, trailingText.length)));
    const at = before.lastIndexOf('@');
    if (at < 0) return null;
    if (at > 0 && !/\s/.test(before[at - 1] ?? '')) return null;
    const query = before.slice(at + 1);
    if (/\s/.test(query)) return null;
    return { query, replaceStart: at };
}

function fuzzyIncludes(haystack: string, needle: string): boolean {
    if (!needle) return true;
    const h = haystack.toLowerCase();
    const n = needle.toLowerCase();
    if (h.includes(n)) return true;
    let hi = 0;
    for (const ch of n) {
        hi = h.indexOf(ch, hi);
        if (hi === -1) return false;
        hi += 1;
    }
    return true;
}

function walkFiles(root: string, dir: string, prefix: string, query: string, out: OverlayItem[], limit: number): void {
    if (out.length >= limit) return;
    let entries: fs.Dirent[];
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const ent of entries) {
        if (out.length >= limit) break;
        if (ent.name.startsWith('.')) continue;
        const rel = prefix ? `${prefix}/${ent.name}` : ent.name;
        if (ent.isDirectory()) {
            if (SKIP_DIRS.has(ent.name)) continue;
            walkFiles(root, path.join(dir, ent.name), rel, query, out, limit);
            continue;
        }
        if (!ent.isFile()) continue;
        if (!fuzzyIncludes(rel, query)) continue;
        out.push({
            name: rel,
            desc: '',
            insertText: `@${rel}`,
            kind: 'file-mention',
        });
    }
}

/** Fuzzy file list for an `@`-mention query (respects common ignore dirs, capped). */
export function listRepoFiles(cwd: string, query: string, limit = 40): OverlayItem[] {
    const items: OverlayItem[] = [];
    walkFiles(cwd, cwd, '', query, items, limit);
    items.sort((a, b) => a.name.localeCompare(b.name));
    return items.slice(0, limit);
}
