export type SendResultLike = {
    ok: boolean;
    error?: string;
    status?: number;
    statusCode?: number;
    [key: string]: unknown;
};

export function sendResultHttpStatus(result: SendResultLike): number {
    if (result.ok) return 200;
    const raw = result.status ?? result.statusCode;
    if (typeof raw === 'number' && raw >= 400 && raw < 600) return raw;
    return 502;
}
