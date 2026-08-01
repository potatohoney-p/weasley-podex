import { getDesktop } from '../panels/desktop-bridge';

export type CopyTextResult = {
    ok: boolean;
    error?: string;
};

function messageFromError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export async function copyText(text: string): Promise<CopyTextResult> {
    try {
        const bridge = getDesktop()?.clipboard;
        if (bridge) {
            const result = await bridge.writeText(text);
            return result.ok ? { ok: true } : { ok: false, error: result.error ?? 'Clipboard bridge rejected the copy request.' };
        }
        if (!navigator.clipboard?.writeText) {
            return { ok: false, error: 'Clipboard API is unavailable.' };
        }
        await navigator.clipboard.writeText(text);
        return { ok: true };
    } catch (error) {
        return { ok: false, error: messageFromError(error) };
    }
}
