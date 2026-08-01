import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface McpRegistryEntry {
    id: string;
    name: string;
    description: string;
    category: string;
    type: 'local' | 'remote';
    config: Record<string, unknown>;
    tags: string[];
    url: string;
}

export interface McpHarnessBuiltin {
    id: string;
    name: string;
    description: string;
    source: string;
    harness: string;
    standalone_config?: Record<string, unknown>;
}

export interface McpRegistryResult {
    entries: McpRegistryEntry[];
    builtins: McpHarnessBuiltin[];
}

interface RegistryPayload {
    version: number;
    servers: Record<string, Omit<McpRegistryEntry, 'id'>>;
    _harness_builtin_reference?: Record<string, {
        name: string;
        description: string;
        source: string;
        harness: string;
        standalone_config?: Record<string, unknown>;
    }>;
}

const REGISTRY_CACHE_PATH = path.join(os.homedir(), '.podex', 'mcp-registry-cache.json');
const CACHE_TTL_MS = 60 * 60 * 1000;

let registryUrl = 'https://raw.githubusercontent.com/potatohoney-p/mcp-ref/main/registry.json';

export function setRegistryUrl(url: string): void {
    registryUrl = url;
}

export async function fetchMcpRegistry(): Promise<McpRegistryResult> {
    const cached = loadCache();
    if (cached) return cached;

    try {
        const res = await fetch(registryUrl);
        if (!res.ok) throw new Error(`Registry fetch failed: ${res.status}`);
        const data = await res.json() as RegistryPayload;
        const result = parseRegistry(data);
        saveCache(result);
        return result;
    } catch (e) {
        console.warn('[mcp-registry] fetch failed, using cache:', (e as Error).message);
        const stale = loadCache(true);
        return stale || { entries: [], builtins: [] };
    }
}

export function fetchMcpRegistryLocal(localPath: string): McpRegistryResult {
    try {
        const raw = fs.readFileSync(localPath, 'utf8');
        return parseRegistry(JSON.parse(raw) as RegistryPayload);
    } catch {
        return { entries: [], builtins: [] };
    }
}

function parseRegistry(data: RegistryPayload): McpRegistryResult {
    const entries: McpRegistryEntry[] = [];
    if (data?.servers) {
        for (const [id, entry] of Object.entries(data.servers)) {
            entries.push({ id, ...entry, type: entry.type || 'local', tags: entry.tags || [], url: entry.url || '' });
        }
    }
    const builtins: McpHarnessBuiltin[] = [];
    if (data?._harness_builtin_reference) {
        for (const [id, entry] of Object.entries(data._harness_builtin_reference)) {
            if (id.startsWith('_')) continue;
            builtins.push({ id, ...entry });
        }
    }
    return { entries, builtins };
}

function loadCache(ignoreExpiry = false): McpRegistryResult | null {
    try {
        const raw = fs.readFileSync(REGISTRY_CACHE_PATH, 'utf8');
        const cached = JSON.parse(raw) as { ts: number; entries: McpRegistryEntry[]; builtins?: McpHarnessBuiltin[] };
        if (!ignoreExpiry && Date.now() - cached.ts > CACHE_TTL_MS) return null;
        return { entries: cached.entries, builtins: cached.builtins || [] };
    } catch {
        return null;
    }
}

function saveCache(result: McpRegistryResult): void {
    try {
        const dir = path.dirname(REGISTRY_CACHE_PATH);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(REGISTRY_CACHE_PATH, JSON.stringify({ ts: Date.now(), ...result }, null, 2));
    } catch { }
}

