/**
 * SGR mouse sequence parser (Phase 4). Wheel + click in alt-screen mode.
 */

export type MouseEvent =
    | { kind: 'wheel-up' | 'wheel-down'; col: number; row: number }
    | { kind: 'press' | 'release'; button: number; col: number; row: number };

/** Parse `\x1b[<btn;col;rowM` / `\x1b[<btn;col;rowm` sequences. Returns consumed length. */
export function parseSgrMouse(data: string): { event: MouseEvent; length: number } | null {
    const m = /^\x1b\[<(\d+);(\d+);(\d+)([mM])/.exec(data);
    if (!m) return null;
    const btn = Number(m[1]);
    const col = Number(m[2]);
    const row = Number(m[3]);
    const release = m[4] === 'm';
    if (btn === 64) return { event: { kind: 'wheel-up', col, row }, length: m[0].length };
    if (btn === 65) return { event: { kind: 'wheel-down', col, row }, length: m[0].length };
    return {
        event: { kind: release ? 'release' : 'press', button: btn, col, row },
        length: m[0].length,
    };
}

export function isMouseSequence(data: string): boolean {
    return data.startsWith('\x1b[<');
}
