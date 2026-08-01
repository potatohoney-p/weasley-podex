type AdvancedConfig = {
    enabled?: boolean;
    provider?: string;
    model?: string;
    apiKey?: string;
    baseUrl?: string;
    vertexConfig?: string;
    bootstrap?: {
        enabled?: boolean;
        useActiveCli?: boolean;
        cli?: string;
        model?: string;
    };
};

let lastExpansionTerms: string[] = [];

export function getLastExpansionTerms() {
    return lastExpansionTerms;
}

export function normalizeOpenAiCompatibleBaseUrl(raw: string) {
    const value = String(raw || '').trim();
    if (!value) return '';
    const trimmed = value.replace(/\/+$/, '');
    return /\/v1$/i.test(trimmed) ? trimmed : `${trimmed}/v1`;
}

function getAdvancedConfig(override: Partial<AdvancedConfig> = {}) {
    return {
        enabled: true,
        provider: override.provider ?? 'integrated',
        model: override.model ?? '',
        apiKey: override.apiKey ?? '',
        baseUrl: normalizeOpenAiCompatibleBaseUrl(override.baseUrl ?? ''),
        vertexConfig: override.vertexConfig ?? '',
        bootstrap: {
            enabled: override.bootstrap?.enabled ?? true,
            useActiveCli: override.bootstrap?.useActiveCli ?? true,
            cli: override.bootstrap?.cli ?? '',
            model: override.bootstrap?.model ?? '',
        },
    };
}

function sanitizeKeywordsWithLimit(input: unknown, limit: number): string[] {
    const raw = Array.isArray(input) ? input : [];
    const out: string[] = [];
    const seen = new Set<string>();
    for (const item of raw) {
        const value = String(item || '')
            .replace(/[;&|`$><]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 48);
        if (!value) continue;
        const key = value.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(value);
        if (out.length >= limit) break;
    }
    return out;
}

export function heuristicKeywords(query: string, limit = 16): string[] {
    const q = String(query || '').trim();
    if (!q) return [];
    const tokens = q.split(/[\s,]+/).map(t => t.trim()).filter(Boolean);
    const out = new Set<string>([q, ...tokens]);
    const lower = q.toLowerCase();
    if (/login|로그인|auth|인증/.test(lower)) {
        out.add('login');
        out.add('auth');
        out.add('인증');
        out.add('401');
    }
    if (/launchd|service|plist|시작 안됨/.test(lower)) {
        out.add('launchd');
        out.add('plist');
        out.add('service');
    }
    return [...out].slice(0, limit);
}

export function expandSearchKeywords(query: string): { exact: string[]; expanded: string[] } {
    const base = String(query || '').trim();
    if (!base) return { exact: [], expanded: [] };
    const heuristic = heuristicKeywords(base);
    const expanded = sanitizeKeywordsWithLimit(heuristic.filter(term => term !== base), 16);
    lastExpansionTerms = [base, ...expanded].slice(0, 16);
    return { exact: [base], expanded };
}

export async function validateAdvancedMemoryConfig(override: Partial<{ provider?: string; model?: string; apiKey?: string; baseUrl?: string; vertexConfig?: string }> = {}) {
    const cfg = getAdvancedConfig(override);
    return { ok: true, provider: cfg.provider || 'integrated', error: '' };
}
