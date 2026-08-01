/**
 * Syntax highlighting via the already-present highlight.js (no new dependency).
 * highlight.js emits HTML; hljsToAnsi() maps its scope spans to our theme tokens.
 * Lazy-initialized once via initHighlight(); highlightCode() is then synchronous.
 * Any failure (missing module, unknown language, parse error) falls back to plain
 * code — the TUI never crashes on highlighting (doc 15 invariant I1).
 */
import { fgToken, RESET, colorLevel, type Token } from './theme.js';

type Hljs = typeof import('highlight.js').default;
let hljs: Hljs | null = null;
let tried = false;

export async function initHighlight(): Promise<void> {
    if (tried) return;
    tried = true;
    try {
        const mod = await import('highlight.js');
        hljs = mod.default ?? (mod as unknown as Hljs);
    } catch {
        hljs = null;
    }
}

// highlight.js scope (sans `hljs-` prefix) → theme token
const SCOPE: Record<string, Token> = {
    keyword: 'code.keyword', literal: 'code.keyword', built_in: 'code.built_in',
    type: 'code.type', string: 'code.string', regexp: 'code.string',
    number: 'code.number', comment: 'code.comment',
    title: 'code.title', function: 'code.title', name: 'code.title',
    attr: 'code.type', attribute: 'code.type',
};

function scopeColor(cls: string): string {
    const key = cls.replace(/^hljs-/, '').split(/[ .]/)[0] ?? '';
    const tok = SCOPE[key];
    return tok ? fgToken(tok) : '';
}

function unescapeHtml(s: string): string {
    return s
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&#39;/g, "'");
}

/**
 * Convert highlight.js HTML output to ANSI, colored via theme tokens.
 * Stack-based so nested scope spans restore the parent color on close.
 * Exported so unit tests can verify scope→escape mapping directly.
 */
export function hljsToAnsi(html: string): string {
    const parts = html.split(/(<\/?span[^>]*>)/);
    const stack: string[] = [];
    let cur = '';
    let out = '';
    for (const p of parts) {
        if (!p) continue;
        const open = /^<span class="([^"]*)">$/.exec(p);
        if (open) {
            stack.push(cur);
            cur = scopeColor(open[1] ?? '') || cur;
            continue;
        }
        if (p === '</span>') {
            cur = stack.pop() ?? '';
            continue;
        }
        if (p.startsWith('<')) continue; // stray/unexpected tag — skip
        const text = unescapeHtml(p);
        out += cur ? cur + text + RESET : text;
    }
    return out;
}

/** Highlight a code block. Returns plain code when mono, unloaded, or lang unknown. */
export function highlightCode(code: string, lang?: string): string {
    if (colorLevel() === 'mono' || !hljs || !lang || !hljs.getLanguage(lang)) return code;
    try {
        return hljsToAnsi(hljs.highlight(code, { language: lang, ignoreIllegals: true }).value);
    } catch {
        return code;
    }
}
