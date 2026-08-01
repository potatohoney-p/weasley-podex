// ── Provider Glyphs ──
// Provider and social-service indicators are generated here from a single,
// brand-neutral shape. No third-party logo artwork is bundled with the frontend.

export type ProviderSlug = 'pi' | 'ai-e' | 'claude' | 'openai' | 'gemini' | 'antigravity' | 'grok' | 'copilot' | 'cursor' | 'kiro-code' | 'codex' | 'codex-app' | 'opencode' | 'discord' | 'telegram';
export type ProviderIconVariant = 'color' | 'mono';

interface ProviderGlyph {
    glyph: string;
    label: string;
}

const PROVIDER_GLYPHS: Record<ProviderSlug, ProviderGlyph> = {
    pi:          { glyph: 'PI', label: 'Pi' },
    'ai-e':      { glyph: 'AI', label: 'AI-E' },
    claude:      { glyph: 'CL', label: 'Claude' },
    openai:      { glyph: 'OA', label: 'OpenAI' },
    gemini:      { glyph: 'GM', label: 'Gemini' },
    antigravity: { glyph: 'AG', label: 'Antigravity' },
    grok:        { glyph: 'GR', label: 'Grok' },
    copilot:     { glyph: 'CP', label: 'Copilot' },
    cursor:      { glyph: 'CU', label: 'Cursor' },
    'kiro-code': { glyph: 'KR', label: 'Kiro' },
    codex:       { glyph: 'CX', label: 'Codex' },
    'codex-app': { glyph: 'CA', label: 'Codex App' },
    opencode:    { glyph: 'OC', label: 'OpenCode' },
    discord:     { glyph: 'DC', label: 'Discord' },
    telegram:    { glyph: 'TG', label: 'Telegram' },
};

function renderProviderGlyph(slug: ProviderSlug, entry: ProviderGlyph, variant: ProviderIconVariant): string {
    return `<svg class="provider-glyph" data-provider-glyph="${slug}" data-variant="${variant}" aria-hidden="true" focusable="false" fill="none" height="1em" viewBox="0 0 24 24" width="1em" xmlns="http://www.w3.org/2000/svg"><rect x="2.75" y="2.75" width="18.5" height="18.5" rx="5.25" stroke="currentColor" stroke-width="1.5"/><text x="12" y="14.8" fill="currentColor" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="7.25" font-weight="700" letter-spacing="-.25" text-anchor="middle">${entry.glyph}</text></svg>`;
}

const PROVIDER_LABEL_ALIASES: Record<string, string> = {
    'claude-e': 'Claude E',
    'ai-e': 'AI-E',
    'claude-exec': 'Claude E',
    'jaw-claude-i': 'Claude E',
    'claude-i': 'Claude E',
    'agy': 'Antigravity',
    cursor: 'Cursor',
    'kiro-code': 'Kiro',
};

function resolveProviderSlug(slug: string): ProviderSlug | null {
    const normalized = slug.toLowerCase().replace(/[-_\s]/g, '');
    if (normalized === 'pi') return 'pi';
    if (normalized === 'aie') return 'ai-e';
    if (normalized === 'claude' || normalized.startsWith('claude')) return 'claude';
    if (normalized === 'gemini' || normalized.startsWith('gemini')) return 'gemini';
    if (normalized === 'antigravity' || normalized === 'agy' || normalized === 'googleantigravity') return 'antigravity';
    if (normalized === 'grok' || normalized.startsWith('grok')) return 'grok';
    if (normalized.startsWith('copilot') || normalized === 'githubcopilot') return 'copilot';
    if (normalized === 'cursor' || normalized.startsWith('cursor')) return 'cursor';
    if (normalized === 'kirocode' || normalized === 'kiro') return 'kiro-code';
    if (normalized === 'codexapp' || normalized === 'codexappserver') return 'codex-app';
    if (normalized === 'codex') return 'codex';
    if (normalized === 'opencode') return 'opencode';
    if (normalized === 'openai' || normalized.startsWith('gpt') || normalized.startsWith('o1') || normalized.startsWith('o3') || normalized.startsWith('o4')) return 'openai';
    if (normalized === 'discord') return 'discord';
    if (normalized === 'telegram') return 'telegram';
    return null;
}

/** Get a brand-neutral, code-rendered provider glyph. */
export function providerIcon(slug: string, variant: ProviderIconVariant = 'color'): string {
    const key = resolveProviderSlug(slug);
    if (!key) return '';

    const safeVariant: ProviderIconVariant = variant === 'mono' ? 'mono' : 'color';
    return renderProviderGlyph(key, PROVIDER_GLYPHS[key], safeVariant);
}

/**
 * Hydrate all `<span data-provider="SLUG">` elements with provider glyphs.
 * Call once after DOMContentLoaded.
 */
export function hydrateProviderIcons(root: Element = document.body): void {
    const els = root.querySelectorAll<HTMLElement>('[data-provider]');
    for (const el of els) {
        const slug = el.dataset['provider'] || '';
        const svg = providerIcon(slug);
        if (svg) {
            el.innerHTML = svg;
            el.classList.add('cli-provider-icon');
        }
    }
}

/** Get a provider's display label. */
export function providerLabel(slug: string): string {
    const alias = PROVIDER_LABEL_ALIASES[slug.toLowerCase()];
    if (alias) return alias;
    const key = resolveProviderSlug(slug);
    if (!key) return slug;
    return PROVIDER_GLYPHS[key].label;
}
