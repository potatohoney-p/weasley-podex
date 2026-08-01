// Mirrored from agbrowse adaptive-fetch v2; keep runtime behavior aligned while Weasley Podex mirror remains experimental.

export const DEFAULT_OUTPUT_CONTENT_BYTES = 64 * 1024;

export function compactAdaptiveFetchResult(result: Record<string, unknown>, options: { contentLimitBytes?: number } = {}): Record<string, unknown> {
    const limit = positiveInteger(options.contentLimitBytes, DEFAULT_OUTPUT_CONTENT_BYTES);
    const compacted = truncateTextToUtf8Bytes((result['content'] as string) || '', limit);
    return {
        ...result,
        content: compacted.text,
        contentBytes: compacted.bytes,
        contentLimitBytes: compacted.limit,
        contentTruncated: compacted.truncated,
    };
}

export function truncateTextToUtf8Bytes(text: string, limit: number): { text: string; bytes: number; limit: number; truncated: boolean } {
    const value = String(text || '');
    const safeLimit = positiveInteger(limit, DEFAULT_OUTPUT_CONTENT_BYTES);
    const bytes = Buffer.byteLength(value, 'utf8');
    if (bytes <= safeLimit) {
        return { text: value, bytes, limit: safeLimit, truncated: false };
    }
    let truncated = value.slice(0, safeLimit);
    while (truncated.length > 0 && Buffer.byteLength(truncated, 'utf8') > safeLimit) {
        truncated = truncated.slice(0, -1);
    }
    return { text: truncated, bytes, limit: safeLimit, truncated: true };
}

export function writeStdoutLine(text: string, stdout: { write: (chunk: string, cb?: (error?: Error | null) => void) => boolean } = process.stdout): Promise<void> {
    const chunk = text.endsWith('\n') ? text : `${text}\n`;
    return new Promise((resolve, reject) => {
        let settled = false;
        const done = (error?: Error | null): void => {
            if (settled) return;
            settled = true;
            if (error) reject(error);
            else resolve(undefined);
        };
        try {
            const accepted = stdout.write(chunk, done);
            if (accepted && stdout !== process.stdout) done();
        } catch (error) {
            done(error as Error);
        }
    });
}

function positiveInteger(value: unknown, fallback: number): number {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

