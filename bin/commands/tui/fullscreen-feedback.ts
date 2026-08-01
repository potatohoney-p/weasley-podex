/**
 * Small fullscreen-only feedback helpers used by input/command paths.
 */
import { appendStatusItem } from '../../../src/cli/tui/transcript.js';
import type { TuiContext } from './types.js';

export function isFullscreen(ctx: TuiContext): boolean {
    return ctx.displayMode === 'fullscreen';
}

export function requestFullscreenFrame(ctx: TuiContext): void {
    if (isFullscreen(ctx)) ctx.requestFrame?.();
}

export function appendFullscreenStatus(ctx: TuiContext, text: string): void {
    appendStatusItem(ctx.store.transcript, text);
    requestFullscreenFrame(ctx);
}
