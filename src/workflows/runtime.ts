// Reads CLI_REGISTRY and normalizes runtime capability metadata for workflows.
// Does NOT import provider SDKs.

import { CLI_REGISTRY, CLI_KEYS } from '../cli/registry.js';

export interface WorkflowRuntimeInfo {
    key: string;
    label: string;
    binary: string;
    hasEfforts: boolean;
    experimental: boolean;
}

export function getAvailableRuntimes(): WorkflowRuntimeInfo[] {
    return CLI_KEYS.map(key => {
        const entry = CLI_REGISTRY[key as keyof typeof CLI_REGISTRY];
        return {
            key,
            label: entry.label,
            binary: entry.binary,
            hasEfforts: Array.isArray(entry.efforts) && entry.efforts.length > 0,
            experimental: 'experimental' in entry && entry.experimental === true,
        };
    });
}

export function getRuntimeByKey(key: string): WorkflowRuntimeInfo | null {
    if (!CLI_KEYS.includes(key as never)) return null;
    const runtimes = getAvailableRuntimes();
    return runtimes.find(r => r.key === key) ?? null;
}

export function isValidRuntime(key: string): boolean {
    return CLI_KEYS.includes(key as never);
}
