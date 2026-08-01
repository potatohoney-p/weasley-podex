// Mirrored from agbrowse adaptive-fetch v2 (skills/browser/adaptive-fetch/defuddle-extractor.mjs).
// In-page Defuddle extraction for the browser-escalation path: the vendored
// IIFE bundle (vendor/defuddle.iife.min.js) is injected into the rendered
// page and parses the live DOM into markdown. See vendor/README.md.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const VENDOR_BUNDLE_PATH = join(
    dirname(fileURLToPath(import.meta.url)),
    'vendor',
    'defuddle.iife.min.js',
);

// @strict-allow-any(playwright page mirrored from agbrowse mjs — duck-typed in-page boundary)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPage = any;

export interface DefuddleParsed {
    content: string;
    title: string;
    author: string;
    published: string;
    wordCount: number;
}

export interface DefuddleRunResult {
    parsed: DefuddleParsed | null;
    reason: string | null;
}

let cachedBundle: string | null = null;

function loadBundleSource(): string {
    if (cachedBundle === null) {
        cachedBundle = readFileSync(VENDOR_BUNDLE_PATH, 'utf8');
    }
    return cachedBundle;
}

/** Reset the bundle cache (test hook). */
export function resetDefuddleBundleCache(): void {
    cachedBundle = null;
}

/**
 * Run Defuddle inside the rendered page and return the parsed result.
 *
 * Injection is attempted in two stages: `addScriptTag` first (fails on
 * CSP-strict pages), then `evaluate` + `new Function` (CDP eval; fails when
 * the page CSP forbids unsafe-eval). Both failing yields `null` with a
 * `reason` so the caller can record a warning — the plain innerText
 * candidate still exists, so extraction degrades, never breaks.
 */
export async function runDefuddleInPage(page: AnyPage): Promise<DefuddleRunResult> {
    if (typeof page?.evaluate !== 'function') {
        return { parsed: null, reason: 'defuddle:no-evaluate' };
    }
    let source: string;
    try {
        source = loadBundleSource();
    } catch (error: unknown) {
        console.error('[defuddle-extractor]', (error as Error)?.message || error);
        return { parsed: null, reason: 'defuddle:bundle-missing' };
    }

    const injected = await injectBundle(page, source);
    if (!injected.ok) return { parsed: null, reason: injected.reason };

    try {
        const parsed = await page.evaluate(() => {
            // @strict-allow-any(in-page global injected by vendored bundle)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const ns = (globalThis as any).Defuddle;
            // UMD/IIFE interop: the global may be the class or a namespace object.
            const D = typeof ns === 'function' ? ns : (ns?.Defuddle || ns?.default);
            if (typeof D !== 'function') return null;
            try {
                const result = new D(document, { markdown: true, url: location.href }).parse();
                if (!result || typeof result.content !== 'string') return null;
                return {
                    content: result.content,
                    title: result.title || '',
                    author: result.author || '',
                    published: result.published || '',
                    wordCount: Number(result.wordCount || 0),
                };
            } catch {
                return null;
            }
        });
        if (!parsed || !String(parsed.content || '').trim()) {
            return { parsed: null, reason: 'defuddle:empty-content' };
        }
        return { parsed: parsed as DefuddleParsed, reason: null };
    } catch (error: unknown) {
        console.error('[defuddle-extractor]', (error as Error)?.message || error);
        return { parsed: null, reason: 'defuddle:parse-failed' };
    }
}

async function injectBundle(page: AnyPage, source: string): Promise<{ ok: boolean, reason: string | null }> {
    const alreadyInjected = await page
        // @strict-allow-any(in-page global probe)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .evaluate(() => typeof (globalThis as any).Defuddle !== 'undefined')
        .catch(() => false);
    if (alreadyInjected) return { ok: true, reason: null };

    if (typeof page.addScriptTag === 'function') {
        try {
            await page.addScriptTag({ content: source });
            return { ok: true, reason: null };
        } catch {
            // CSP-blocked script tag — fall through to the CDP eval path.
        }
    }
    try {
        await page.evaluate((src: string) => {
            // eslint-disable-next-line no-new-func -- vendored bundle injection on CSP-strict pages
            new Function(src)();
        }, source);
        const defined = await page
            // @strict-allow-any(in-page global probe)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .evaluate(() => typeof (globalThis as any).Defuddle !== 'undefined')
            .catch(() => false);
        return defined
            ? { ok: true, reason: null }
            : { ok: false, reason: 'defuddle:inject-failed' };
    } catch {
        return { ok: false, reason: 'defuddle:csp-blocked' };
    }
}
