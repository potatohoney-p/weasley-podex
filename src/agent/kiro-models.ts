import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { detectCli } from '../core/cli-detection.js';

import { stripUndefined } from '../core/strip-undefined.js';

const execFileAsync = promisify(execFile);

export interface KiroModelEntry {
    modelId: string;
    modelName: string;
    description?: string;
    contextWindowTokens?: number;
    rateMultiplier?: number;
    rateUnit?: string;
}

export interface KiroModelInventory {
    models: string[];
    defaultModel: string;
    entries: KiroModelEntry[];
    source: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
}

export function parseKiroModelListJson(stdout: string): KiroModelInventory | null {
    const trimmed = stdout.trim();
    if (!trimmed.startsWith('{')) return null;

    try {
        const data = JSON.parse(trimmed) as Record<string, unknown>;
        const rawModels = Array.isArray(data['models']) ? data['models'] : [];
        const entries: KiroModelEntry[] = [];

        for (const item of rawModels) {
            const row = asRecord(item);
            if (!row) continue;
            const modelId = typeof row['model_id'] === 'string'
                ? row['model_id']
                : typeof row['model_name'] === 'string'
                    ? row['model_name']
                    : '';
            if (!modelId.trim()) continue;
            entries.push(stripUndefined({
                modelId,
                modelName: typeof row['model_name'] === 'string' ? row['model_name'] : modelId,
                description: typeof row['description'] === 'string' ? row['description'] : undefined,
                contextWindowTokens: typeof row['context_window_tokens'] === 'number'
                    ? row['context_window_tokens']
                    : undefined,
                rateMultiplier: typeof row['rate_multiplier'] === 'number'
                    ? row['rate_multiplier']
                    : undefined,
                rateUnit: typeof row['rate_unit'] === 'string' ? row['rate_unit'] : undefined,
            }) as KiroModelEntry);
        }

        if (!entries.length) return null;

        const defaultModel = typeof data['default_model'] === 'string' && data['default_model'].trim()
            ? data['default_model']
            : entries[0]!.modelId;

        return {
            models: entries.map((entry) => entry.modelId),
            defaultModel,
            entries,
            source: 'kiro-cli chat --list-models --format json',
        };
    } catch {
        return null;
    }
}

export async function fetchKiroModelInventory(binary?: string): Promise<KiroModelInventory | null> {
    const resolvedBinary = binary || detectCli('kiro-code').path;
    if (!resolvedBinary) return null;

    try {
        const { stdout } = await execFileAsync(resolvedBinary, [
            'chat',
            '--list-models',
            '--format', 'json',
        ], {
            encoding: 'utf8',
            timeout: 15000,
            env: { ...process.env, NO_COLOR: '1' },
        });
        return parseKiroModelListJson(stdout);
    } catch {
        return null;
    }
}
