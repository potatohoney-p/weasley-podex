// Workflow permission profiles — SDK-free.
// Maps read/edit/bash/network/MCP scopes deterministically.

export type PermissionScope = 'read' | 'edit' | 'bash' | 'network' | 'mcp';
export type PermissionLevel = 'allow' | 'deny' | 'ask';

export interface PermissionRule {
    scope: PermissionScope;
    level: PermissionLevel;
    pattern?: string | undefined;
}

export interface WorkflowPermissionProfile {
    id: string;
    name: string;
    rules: PermissionRule[];
    createdAt: string;
}

export const DEFAULT_PROFILES: Record<string, PermissionRule[]> = {
    'read-only': [
        { scope: 'read', level: 'allow' },
        { scope: 'edit', level: 'deny' },
        { scope: 'bash', level: 'deny' },
        { scope: 'network', level: 'deny' },
        { scope: 'mcp', level: 'deny' },
    ],
    'audit': [
        { scope: 'read', level: 'allow' },
        { scope: 'edit', level: 'deny' },
        { scope: 'bash', level: 'ask', pattern: 'tsc|vitest|npm test' },
        { scope: 'network', level: 'deny' },
        { scope: 'mcp', level: 'deny' },
    ],
    'build': [
        { scope: 'read', level: 'allow' },
        { scope: 'edit', level: 'allow' },
        { scope: 'bash', level: 'ask' },
        { scope: 'network', level: 'deny' },
        { scope: 'mcp', level: 'ask' },
    ],
};
