// Context-map builder — SDK-free.
// Deterministic repo context package for planning, audit, and employees.

import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

export interface ContextMapEntry {
    path: string;
    kind: 'source' | 'test' | 'config' | 'doc' | 'structure';
    sizeBytes: number;
}

export interface ContextMap {
    repoRoot: string;
    createdAt: string;
    entries: ContextMapEntry[];
    totalFiles: number;
    structureDocs: string[];
}

function classifyFile(relPath: string): ContextMapEntry['kind'] {
    if (relPath.includes('test') || relPath.includes('spec')) return 'test';
    if (relPath.startsWith('structure/')) return 'structure';
    if (relPath.endsWith('.md') || relPath.startsWith('docs/')) return 'doc';
    if (relPath.includes('config') || relPath.endsWith('.json') || relPath.endsWith('.mjs')) return 'config';
    return 'source';
}

export function buildContextMap(repoRoot: string, maxDepth = 3): ContextMap {
    const entries: ContextMapEntry[] = [];
    const structureDocs: string[] = [];

    function walk(dir: string, depth: number) {
        if (depth > maxDepth) return;
        if (!existsSync(dir)) return;
        try {
            for (const entry of readdirSync(dir, { withFileTypes: true })) {
                if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
                const abs = join(dir, entry.name);
                if (entry.isDirectory()) {
                    walk(abs, depth + 1);
                    continue;
                }
                if (!/\.(ts|tsx|js|mjs|json|md)$/.test(entry.name)) continue;
                const rel = relative(repoRoot, abs);
                const stat = statSync(abs);
                const kind = classifyFile(rel);
                entries.push({ path: rel, kind, sizeBytes: stat.size });
                if (kind === 'structure') structureDocs.push(rel);
            }
        } catch {
            // skip inaccessible dirs
        }
    }

    walk(repoRoot, 0);

    return {
        repoRoot,
        createdAt: new Date().toISOString(),
        entries,
        totalFiles: entries.length,
        structureDocs,
    };
}

export function getHotFiles(contextMap: ContextMap, topN = 10): ContextMapEntry[] {
    return [...contextMap.entries]
        .sort((a, b) => b.sizeBytes - a.sizeBytes)
        .slice(0, topN);
}
