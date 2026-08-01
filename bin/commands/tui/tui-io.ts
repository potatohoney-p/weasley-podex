/**
 * TUI stdout routing — line-mode writes vs fullscreen frame requests.
 */
import type { TuiContext } from './types.js';

export function tuiWrite(ctx: TuiContext, chunk: string): void {
    if (ctx.displayMode === 'fullscreen') {
        ctx.requestFrame?.();
        return;
    }
    process.stdout.write(chunk);
}
