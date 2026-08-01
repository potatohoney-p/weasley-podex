import type { IncomingHttpHeaders, OutgoingHttpHeaders } from 'node:http';

const LINK_POLICY_MARKER = 'data-jaw-preview-link-policy';
const DROP_OBSERVER_MARKER = 'data-jaw-preview-drop-observer';

const PREVIEW_LINK_POLICY_SCRIPT = `<script ${LINK_POLICY_MARKER}>(function(){function e(e){try{return new URL(e,location.href)}catch{return null}}function t(e){if(!e)return false;if(e.protocol!=="http:"&&e.protocol!=="https:")return false;if(e.username||e.password)return false;return e.origin!==location.origin}function n(e){var t=e&&e.nodeType===1?e:e&&e.parentElement;return t&&t.closest?t.closest("a[href]"):null}function r(e){if(!t(e))return false;window.open(e.href,"_blank","noopener,noreferrer");return true}document.addEventListener("click",function(o){var i=n(o.target);if(!i)return;var a=e(i.getAttribute("href")||"");if(!t(a))return;o.preventDefault();r(a)},true);document.addEventListener("submit",function(n){var r=n.target;if(!r||!r.action)return;var o=e(r.action);if(!t(o))return;r.target="_blank"},true);})();</script>`;
const PREVIEW_DROP_OBSERVER_SCRIPT = `<script ${DROP_OBSERVER_MARKER}>(function(){function t(){try{return document.referrer?new URL(document.referrer).origin:"*"}catch{return"*"}}document.addEventListener("drop",function(e){try{var r=e.dataTransfer&&e.dataTransfer.files?Array.prototype.slice.call(e.dataTransfer.files):[];if(!r.length||!window.parent||window.parent===window)return;setTimeout(function(){try{window.parent.postMessage({type:"jaw-preview-dropped-files",files:r},t())}catch(e){}},0)}catch(e){}},true);})();</script>`;
const PREVIEW_INJECTED_SCRIPTS = `${PREVIEW_LINK_POLICY_SCRIPT}${PREVIEW_DROP_OBSERVER_SCRIPT}`;

/** Injection buffers the whole HTML body in memory. Documents past this size
 *  are streamed through uninjected instead of risking unbounded heap growth. */
export const MAX_INJECT_BUFFER_CHARS = 2_000_000;

function headerValue(headers: IncomingHttpHeaders | OutgoingHttpHeaders, key: string): string {
    const value = headers[key] ?? headers[key.toLowerCase()];
    if (Array.isArray(value)) return value.join(', ');
    return String(value ?? '');
}

export function preferIdentityEncoding(
    headers: IncomingHttpHeaders | OutgoingHttpHeaders,
): OutgoingHttpHeaders {
    return {
        ...headers,
        'accept-encoding': 'identity',
    };
}

export function shouldInjectPreviewLinkPolicy(
    method: string | undefined,
    statusCode: number | undefined,
    headers: IncomingHttpHeaders,
): boolean {
    if (method === 'HEAD') return false;
    if (!statusCode || statusCode < 200 || statusCode >= 300) return false;
    if (!headerValue(headers, 'content-type').toLowerCase().includes('text/html')) return false;
    const encoding = headerValue(headers, 'content-encoding').trim().toLowerCase();
    return !encoding || encoding === 'identity';
}

export function prepareInjectedPreviewHeaders(
    headers: OutgoingHttpHeaders,
): OutgoingHttpHeaders {
    const next: OutgoingHttpHeaders = { ...headers };
    for (const key of Object.keys(next)) {
        const lower = key.toLowerCase();
        if (lower === 'content-length' || lower === 'content-encoding') {
            delete next[key];
        }
    }
    return next;
}

export function injectPreviewLinkPolicy(html: string): string {
    if (!html || (html.includes(LINK_POLICY_MARKER) && html.includes(DROP_OBSERVER_MARKER))) return html;
    const scripts = [
        html.includes(LINK_POLICY_MARKER) ? '' : PREVIEW_LINK_POLICY_SCRIPT,
        html.includes(DROP_OBSERVER_MARKER) ? '' : PREVIEW_DROP_OBSERVER_SCRIPT,
    ].join('');
    if (/<head(?:\s[^>]*)?>/i.test(html)) {
        return html.replace(/<head(?:\s[^>]*)?>/i, match => `${match}${scripts}`);
    }
    if (/<html(?:\s[^>]*)?>/i.test(html)) {
        return html.replace(/<html(?:\s[^>]*)?>/i, match => `${match}${scripts}`);
    }
    return `${scripts || PREVIEW_INJECTED_SCRIPTS}${html}`;
}
