// Mirrored from agbrowse adaptive-fetch v2; keep runtime behavior aligned while Weasley Podex mirror remains experimental.

export function htmlToReadableText(html: string = ''): string {
    return decodeHtmlEntities(html)
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
        .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|section|article|li|h[1-6])>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .split('\n')
        .map(line => normalizeWhitespace(line))
        .filter(Boolean)
        .join('\n');
}

export function extractTitleFromHtml(html: string = ''): string {
    const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    return match ? normalizeWhitespace(decodeHtmlEntities(match[1])) : '';
}

export function dedupeCandidateUrls(urls: string[] = []): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of urls) {
        try {
            const href = new URL(raw).href;
            if (!seen.has(href)) {
                seen.add(href);
                out.push(href);
            }
        } catch {
            // Ignore invalid candidates; validation happens before network work.
        }
    }
    return out;
}

export function normalizeWhitespace(text: string = ''): string {
    return text.replace(/\s+/g, ' ').trim();
}

export function isHtmlContentType(contentType: string = ''): boolean {
    return /\btext\/html\b/i.test(contentType);
}

export function isTextualContentType(contentType: string = ''): boolean {
    if (!contentType) return true;
    return /^text\//i.test(contentType)
        || /\b(application|.+)\/(json|xml|rss\+xml|atom\+xml|xhtml\+xml|javascript)\b/i.test(contentType);
}

export function decodeHtmlEntities(text: string = ''): string {
    return text
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/g, "'");
}

