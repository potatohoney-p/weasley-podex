import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { resolveHomePath } from '../../src/core/path-expand.js';
import { getWeasleyPodexEnv } from '../../src/core/weasley-podex-env.js';

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

const configuredHome = getWeasleyPodexEnv('HOME');
const registryHome = configuredHome
    ? resolveHomePath(configuredHome, os.homedir())
    : path.join(os.homedir(), '.weasley', 'podex');
const REGISTRY_CACHE_PATH = path.join(registryHome, 'mcp-registry-cache.json');
const CACHE_TTL_MS = 60 * 60 * 1000;
const REMOTE_TIMEOUT_MS = 8_000;

let registryUrlOverride: string | null | undefined;

/**
 * Override the optional remote registry for this process. Passing undefined
 * restores environment-based discovery; an empty string disables remote fetches.
 */
export function setRegistryUrl(url?: string): void {
    registryUrlOverride = url === undefined ? undefined : normalizeRegistryUrl(url);
}

export async function fetchMcpRegistry(): Promise<McpRegistryResult> {
    const cached = loadCache();
    if (isUsableRegistry(cached)) return cached;

    const registryUrl = configuredRegistryUrl();
    if (registryUrl) {
        try {
            const res = await fetch(registryUrl, {
                signal: AbortSignal.timeout(REMOTE_TIMEOUT_MS),
            });
            if (!res.ok) throw new Error(`Registry fetch failed: ${res.status}`);
            const result = parseRegistry(await res.json() as RegistryPayload);
            if (!isUsableRegistry(result)) throw new Error('Registry response is empty');
            saveCache(result);
            return result;
        } catch (e) {
            console.warn('[mcp-registry] configured remote failed, using bundled registry:', (e as Error).message);
        }
    }

    const bundled = fetchMcpRegistryBundled();
    if (isUsableRegistry(bundled)) return bundled;

    const stale = loadCache(true);
    return isUsableRegistry(stale) ? stale : emptyRegistry();
}

export function fetchMcpRegistryLocal(localPath: string): McpRegistryResult {
    try {
        const raw = fs.readFileSync(localPath, 'utf8');
        return parseRegistry(JSON.parse(raw) as RegistryPayload);
    } catch {
        return { entries: [], builtins: [] };
    }
}

/** Read the registry shipped with the current source tree or npm package. */
export function fetchMcpRegistryBundled(): McpRegistryResult {
    return fetchMcpRegistryLocal(getBundledMcpRegistryPath());
}

export function getBundledMcpRegistryPath(): string {
    let dir = path.dirname(fileURLToPath(import.meta.url));
    while (dir !== path.dirname(dir)) {
        if (fs.existsSync(path.join(dir, 'package.json'))) {
            return path.join(dir, 'mcp-ref', 'registry.json');
        }
        dir = path.dirname(dir);
    }
    return path.join(path.dirname(fileURLToPath(import.meta.url)), 'registry.json');
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
        if (!Number.isFinite(cached.ts) || !Array.isArray(cached.entries)) return null;
        if (!ignoreExpiry && Date.now() - cached.ts > CACHE_TTL_MS) return null;
        return { entries: cached.entries, builtins: Array.isArray(cached.builtins) ? cached.builtins : [] };
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

function configuredRegistryUrl(): string | null {
    if (registryUrlOverride !== undefined) return registryUrlOverride;
    return normalizeRegistryUrl(getWeasleyPodexEnv('MCP_REGISTRY_URL') || '');
}

function normalizeRegistryUrl(value: string): string | null {
    const trimmed = value.trim();
    return trimmed || null;
}

function emptyRegistry(): McpRegistryResult {
    return { entries: [], builtins: [] };
}

function isUsableRegistry(result: McpRegistryResult | null): result is McpRegistryResult {
    return result !== null && (result.entries.length > 0 || result.builtins.length > 0);
}

