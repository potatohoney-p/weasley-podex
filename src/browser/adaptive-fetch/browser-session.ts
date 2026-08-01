// Mirrored from agbrowse adaptive-fetch v2; keep runtime behavior aligned while podex mirror remains experimental.

import type { ReaderCandidate } from './types.js';
import { getFetchBrowserPage, closeFetchBrowserPage } from './browser-runtime.js';
import { validateFetchUrl } from './safety.js';

interface BrowserDepsOption {
    browserDeps?: Record<string, unknown>;
}

interface SessionOptions {
    browserSession?: string;
    browserSessionRaw?: string;
    browserDeps?: Record<string, unknown>;
}

interface NavigateOptions {
    browserDeps?: Record<string, unknown>;
    timeoutMs?: number;
    selector?: string | null;
    allowPrivateNetwork?: boolean;
}

export function isUserSessionAvailable(options: BrowserDepsOption = {}): boolean {
    const deps: Record<string, unknown> = (options?.browserDeps || {}) as Record<string, unknown>;
    return typeof deps['getPage'] === 'function';
}

export function shouldTryUserSession(candidates: ReaderCandidate[], options: SessionOptions): boolean | 'prompt' {
    const rawSession = options.browserSessionRaw || options.browserSession;
    if (rawSession === 'user' || rawSession === 'interactive') return true;
    const hasChallenge = candidates.some(c =>
        c.challenge?.type === 'challenge' ||
        c.challenge?.type === 'auth_required' ||
        c.challenge?.type === 'paywall'
    );
    if (hasChallenge && isUserSessionAvailable(options)) return 'prompt';
    return false;
}

export async function navigateInUserSession(url: string, options: NavigateOptions) {
    const pageRef = await getFetchBrowserPage({
        ...(options.browserDeps != null ? { browserDeps: options.browserDeps } : {}),
        browserSession: 'existing' as const,
    });
    try {
        const page = pageRef.page as Record<string, unknown>;
        let navStatus = 200;
        let navOk = true;
        if (typeof page['goto'] === 'function') {
            const response: Record<string, unknown> | null = await (page['goto'] as (url: string, opts: Record<string, unknown>) => Promise<Record<string, unknown> | null>)(url, { waitUntil: 'networkidle', timeout: options.timeoutMs || 15000 });
            if (response) {
                navStatus = typeof response['status'] === 'function' ? (response['status'] as () => number)() : ((response['status'] as number) || 200);
                navOk = navStatus >= 200 && navStatus < 400;
            }
        }
        const title: string = typeof page['title'] === 'function' ? await (page['title'] as () => Promise<string>)() : '';
        let text = '';
        if (options.selector && typeof page['locator'] === 'function') {
            const locator = (page['locator'] as (sel: string) => { first: () => { innerText: (opts: { timeout: number }) => Promise<string> } })(options.selector);
            text = await locator.first().innerText({ timeout: 2000 }).catch(() => '');
        } else if (typeof page['evaluate'] === 'function') {
            text = await (page['evaluate'] as (fn: () => string) => Promise<string>)(() => document.body?.innerText || '');
        }
        const finalUrl: string = typeof page['url'] === 'function' ? (page['url'] as () => string)() : url;
        const warnings: string[] = [];
        try {
            validateFetchUrl(finalUrl, options.allowPrivateNetwork != null ? { allowPrivateNetwork: options.allowPrivateNetwork } : {});
        } catch {
            warnings.push('user-session-redirected-to-private-url');
            return {
                source: 'browser_user',
                finalUrl,
                title,
                text: '',
                contentType: 'text/html',
                status: navStatus,
                ok: false,
                session: 'user',
                evidence: ['user-session-render', 'private-url-rejected'],
                warnings,
                safetyFlags: ['user_session_used'],
            };
        }
        return {
            source: 'browser_user',
            finalUrl,
            title,
            text,
            contentType: 'text/html',
            status: navStatus,
            ok: navOk,
            session: 'user',
            evidence: ['user-session-render'],
            warnings,
            safetyFlags: ['user_session_used'],
        };
    } finally {
        await closeFetchBrowserPage(pageRef);
    }
}

