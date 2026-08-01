import { loadUnifiedMcp } from '../../lib/mcp-sync.js';
import { fetchMcpRegistryLocal, type McpRegistryResult } from '../../lib/mcp/mcp-registry.js';
import { join } from 'path';
import { JAW_HOME } from '../../lib/mcp/skills-utils.js';
import os from 'os';

export interface AcpMcpServer {
    name: string;
    type?: string;
    url?: string;
    command?: string;
    args?: string[];
    env?: Record<string, string>;
}

export function getEmployeeMcpServers(): AcpMcpServer[] {
    try {
        const config = loadUnifiedMcp();
        const servers = config?.servers || {};
        return Object.entries(servers).map(([name, srv]: [string, any]) => ({
            name,
            ...(srv.url ? { type: srv.type || 'http', url: srv.url } : {}),
            ...(srv.command ? { command: srv.command } : {}),
            ...(srv.args ? { args: srv.args } : {}),
            ...(srv.env ? { env: srv.env } : {}),
        }));
    } catch {
        return [];
    }
}

export function getEmployeeMcpToolSummary(): string {
    try {
        const config = loadUnifiedMcp();
        const serverNames = Object.keys(config?.servers || {});
        if (serverNames.length === 0) return '';

        const registryPaths = [
            join(JAW_HOME, 'mcp-ref', 'registry.json'),
            join(os.homedir(), 'Developer', 'new', '700_projects', 'mcp-ref', 'registry.json'),
        ];
        let registry: McpRegistryResult = { entries: [], builtins: [] };
        for (const p of registryPaths) {
            const r = fetchMcpRegistryLocal(p);
            if (r.entries.length > 0) { registry = r; break; }
        }
        const registryMap = new Map(registry.entries.map(e => [e.id, e]));

        const lines = [
            '## Available MCP Tools',
            'These MCP servers are connected in your session. Use `ToolSearch` to load tool schemas before calling them.',
        ];
        for (const name of serverNames) {
            const entry = registryMap.get(name);
            const desc = entry?.description || 'No description available';
            const tags = entry?.tags?.length ? ` [${entry.tags.join(', ')}]` : '';
            lines.push(`- **${name}**: ${desc}${tags}`);
        }
        return lines.join('\n');
    } catch {
        return '';
    }
}
