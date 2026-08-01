/**
 * TUI renderer for `search-results` structured fences.
 * Renders as a numbered list: title (bold), URL (underlined), snippet (dimmed).
 */
import { BOLD, DIM, UNDER, RESET, paint } from '../theme.js';

type RawResult = {
    title?: unknown;
    url?: unknown;
    link?: unknown;
    snippet?: unknown;
    description?: unknown;
};

type SearchResultsPayload =
    | RawResult[]
    | { results?: RawResult[]; query?: unknown; schemaVersion?: unknown };

function str(v: unknown): string {
    return typeof v === 'string' ? v.trim() : '';
}

function normalizeResults(raw: SearchResultsPayload): RawResult[] {
    if (Array.isArray(raw)) return raw;
    if (raw && typeof raw === 'object' && Array.isArray((raw as { results?: unknown }).results)) {
        return (raw as { results: RawResult[] }).results;
    }
    return [];
}

/**
 * Wrap text to at most `width` chars per line, returning at most `maxLines` lines.
 * Preserves word boundaries where possible.
 */
function wrapSnippet(text: string, width: number, maxLines: number): string[] {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
        if (lines.length >= maxLines) break;
        if (!current) {
            current = word.length > width ? word.slice(0, width - 1) + '…' : word;
        } else if ((current + ' ' + word).length <= width) {
            current += ' ' + word;
        } else {
            lines.push(current);
            if (lines.length >= maxLines) break;
            current = word.length > width ? word.slice(0, width - 1) + '…' : word;
        }
    }
    if (current && lines.length < maxLines) lines.push(current);
    return lines;
}

/**
 * Render a `search-results` fence payload as a TUI bulleted list.
 *
 * @param json       Raw JSON string from the fence body
 * @param termWidth  Terminal width for snippet truncation
 * @returns          Formatted ANSI string ready for display
 */
export function renderSearchResultsBlock(json: string, termWidth: number): string {
    let payload: SearchResultsPayload;
    try {
        payload = JSON.parse(json) as SearchResultsPayload;
    } catch {
        const errMsg = paint('status.error', 'search-results: invalid JSON', BOLD);
        return `${errMsg}\n`;
    }

    const results = normalizeResults(payload);
    if (results.length === 0) {
        return `${DIM}(no search results)${RESET}\n`;
    }

    const snippetWidth = Math.max(40, termWidth - 5); // 5 = "   " indent + breathing room
    const lines: string[] = [];

    results.forEach((r, i) => {
        const title = str(r.title) || '(untitled)';
        const url = str(r.url) || str(r.link);
        const snippet = str(r.snippet) || str(r.description);

        // 1. Title line — numbered + bold
        lines.push(`${BOLD}${i + 1}. ${title}${RESET}`);

        // 2. URL line — underlined + accent color, indented
        if (url) {
            lines.push(`   ${UNDER}${paint('link', url)}${RESET}`);
        }

        // 3. Snippet — dimmed, up to 2 wrapped lines, indented
        if (snippet) {
            const wrapped = wrapSnippet(snippet, snippetWidth, 2);
            for (const line of wrapped) {
                lines.push(`   ${DIM}${line}${RESET}`);
            }
        }
    });

    return lines.join('\n') + '\n';
}
