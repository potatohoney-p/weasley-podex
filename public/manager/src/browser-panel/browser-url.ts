const BLOCKED_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '0.0.0.0']);

export const DEFAULT_BROWSER_URL = 'https://www.google.com/';
export const GOOGLE_SEARCH_URL = 'https://www.google.com/search?q=';

export function isPrivateHost(hostname: string): boolean {
    return /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(hostname);
}

export function bareHostname(target: string): string {
    const authority = target.split(/[/?#]/, 1)[0] ?? '';
    if (authority.startsWith('[')) {
        const end = authority.indexOf(']');
        return end > 0 ? authority.slice(1, end).toLowerCase() : authority.toLowerCase();
    }
    return authority.split(':', 1)[0]?.toLowerCase() ?? '';
}

export function shouldDefaultToHttp(target: string): boolean {
    const authority = target.split(/[/?#]/, 1)[0] ?? '';
    const host = bareHostname(target);
    if (!host) return false;
    if (host === 'localhost' || host === '0.0.0.0' || host === '127.0.0.1' || host === '::1') return true;
    if (host.endsWith('.local') || isPrivateHost(host)) return true;
    return /:\d+$/.test(authority);
}

function hasExplicitScheme(target: string): boolean {
    return /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(target);
}

function isUrlLikeTarget(target: string): boolean {
    const host = bareHostname(target);
    const authority = target.split(/[/?#]/, 1)[0] ?? '';
    if (!host) return false;
    if (/\s/.test(authority)) return false;
    if (host === 'localhost' || host === '0.0.0.0' || host === '127.0.0.1' || host === '::1') return true;
    if (host.endsWith('.local') || isPrivateHost(host)) return true;
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(host)) return true;
    if (authority.includes(':') && /:\d+$/.test(authority)) return true;
    return host.includes('.');
}

export function normalizeBrowserTarget(target: string): string | null {
    const trimmed = target.trim();
    if (!trimmed) return null;
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    if (isUrlLikeTarget(trimmed)) return `${shouldDefaultToHttp(trimmed) ? 'http' : 'https'}://${trimmed}`;
    if (hasExplicitScheme(trimmed)) return trimmed;
    return `${GOOGLE_SEARCH_URL}${encodeURIComponent(trimmed)}`;
}

export function isRestrictedBrowserHost(hostname: string): boolean {
    return BLOCKED_HOSTS.has(hostname) || hostname.endsWith('.local') || isPrivateHost(hostname);
}
