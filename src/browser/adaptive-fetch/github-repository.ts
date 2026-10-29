interface GitHubAccessFailure {
    code: 'github-repo-forbidden' | 'github-repo-rate-limited';
    text: string;
    metadata: Record<string, unknown>;
}

/** A repository API denial must not trigger a different reader or identity. */
export function githubRepositoryAccessFailure(
    status: number,
    headers: Record<string, unknown>,
    message: unknown,
): GitHubAccessFailure | null {
    if (status !== 403 && status !== 429) return null;
    const retryAfterSeconds = numericHeader(headers['retry-after']);
    const retryAfterAt = httpDateHeader(headers['retry-after']);
    const resetSeconds = numericHeader(headers['x-ratelimit-reset']);
    const rateLimitResetAt = resetSeconds === null ? null : isoDate(resetSeconds * 1000);
    const rateLimited = status === 429
        || retryAfterSeconds !== null
        || retryAfterAt !== null
        || headers['x-ratelimit-remaining'] === '0'
        || (typeof message === 'string' && /secondary rate limit|api rate limit exceeded/i.test(message));
    const code = rateLimited ? 'github-repo-rate-limited' : 'github-repo-forbidden';
    return {
        code,
        text: rateLimited
            ? 'GitHub repository API rate limit reached. Stop requests and wait before retrying; respect any server retry time.'
            : 'GitHub repository API access is forbidden. Check repository access before retrying.',
        metadata: {
            error: code,
            status,
            ...(retryAfterSeconds !== null ? { retryAfterSeconds } : {}),
            ...(retryAfterAt !== null ? { retryAfterAt } : {}),
            ...(rateLimitResetAt !== null ? { rateLimitResetAt } : {}),
        },
    };
}

function httpDateHeader(value: unknown): string | null {
    if (typeof value !== 'string' || value.length !== 29) return null;
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp) || new Date(timestamp).toUTCString() !== value) return null;
    return isoDate(timestamp);
}

function isoDate(timestamp: number): string | null {
    const date = new Date(timestamp);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function numericHeader(value: unknown): number | null {
    if (typeof value !== 'string' || !/^\d{1,16}$/.test(value)) return null;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
}
