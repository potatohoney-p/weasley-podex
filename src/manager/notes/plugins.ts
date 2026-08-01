import { existsSync } from 'node:fs';
import { readFile, readdir, writeFile, mkdir, stat, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { dashboardPath } from '../dashboard-home.js';

export type PluginPermission = 'notes:read' | 'notes:list' | 'ui:notify' | 'command:register';

export type PluginManifest = {
    id: string;
    name: string;
    version: string;
    description?: string;
    permissions: PluginPermission[];
};

export type PluginEntry = {
    id: string;
    name: string;
    version: string;
    description: string;
    permissions: PluginPermission[];
    enabled: boolean;
};

type PluginsConfig = {
    enabled: Record<string, boolean>;
};

const VALID_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const VALID_PERMISSIONS: Set<string> = new Set(['notes:read', 'notes:list', 'ui:notify', 'command:register']);

export class PluginManager {
    private readonly pluginsDir: string;

    constructor(notesRoot?: string) {
        const root = notesRoot || dashboardPath('notes');
        this.pluginsDir = join(root, '_plugins');
    }

    private configPath(): string {
        return join(this.pluginsDir, '.config.json');
    }

    private async readConfig(): Promise<PluginsConfig> {
        try {
            const raw = await readFile(this.configPath(), 'utf8');
            return JSON.parse(raw) as PluginsConfig;
        } catch {
            return { enabled: {} };
        }
    }

    private async writeConfig(config: PluginsConfig): Promise<void> {
        await mkdir(this.pluginsDir, { recursive: true });
        await writeFile(this.configPath(), JSON.stringify(config, null, 2), 'utf8');
    }

    private async readManifest(pluginDir: string): Promise<PluginManifest | null> {
        const manifestPath = join(pluginDir, 'manifest.json');
        if (!existsSync(manifestPath)) return null;
        try {
            const raw = await readFile(manifestPath, 'utf8');
            const manifest = JSON.parse(raw);
            if (typeof manifest.id !== 'string' || typeof manifest.name !== 'string' || typeof manifest.version !== 'string') return null;
            if (!VALID_ID.test(manifest.id)) return null;
            const permissions = Array.isArray(manifest.permissions)
                ? manifest.permissions.filter((p: unknown) => typeof p === 'string' && VALID_PERMISSIONS.has(p))
                : [];
            return {
                id: manifest.id,
                name: manifest.name,
                version: manifest.version,
                description: manifest.description ?? '',
                permissions: permissions as PluginPermission[],
            };
        } catch {
            return null;
        }
    }

    async listPlugins(): Promise<PluginEntry[]> {
        if (!existsSync(this.pluginsDir)) return [];
        const config = await this.readConfig();
        const entries: PluginEntry[] = [];
        const dirs = await readdir(this.pluginsDir, { withFileTypes: true });
        for (const dir of dirs) {
            if (!dir.isDirectory() || dir.name.startsWith('.')) continue;
            const manifest = await this.readManifest(join(this.pluginsDir, dir.name));
            if (!manifest) continue;
            entries.push({
                ...manifest,
                description: manifest.description ?? '',
                enabled: config.enabled[manifest.id] === true,
            });
        }
        return entries.sort((a, b) => a.name.localeCompare(b.name));
    }

    async togglePlugin(id: string, enabled: boolean): Promise<void> {
        if (!VALID_ID.test(id)) throw new Error('Invalid plugin ID');
        const config = await this.readConfig();
        config.enabled[id] = enabled;
        await this.writeConfig(config);
    }

    async getPluginAsset(id: string, assetPath: string): Promise<{ content: Buffer; mime: string } | null> {
        if (!VALID_ID.test(id)) return null;
        if (assetPath.includes('..') || assetPath.startsWith('/')) return null;
        const filePath = join(this.pluginsDir, id, assetPath);
        if (!existsSync(filePath)) return null;
        const fileStat = await stat(filePath);
        if (!fileStat.isFile() || fileStat.size > 1024 * 1024) return null;
        const pluginRoot = join(this.pluginsDir, id);
        const realTarget = await realpath(filePath);
        const realRoot = await realpath(pluginRoot);
        if (!realTarget.startsWith(realRoot + '/') && realTarget !== realRoot) return null;
        const content = await readFile(filePath);
        const mime = assetPath.endsWith('.html') ? 'text/html'
            : assetPath.endsWith('.js') ? 'application/javascript'
            : assetPath.endsWith('.css') ? 'text/css'
            : assetPath.endsWith('.json') ? 'application/json'
            : 'application/octet-stream';
        return { content, mime };
    }
}
