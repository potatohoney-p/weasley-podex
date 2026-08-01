// Ellipsis: dual value+namespace, matches @gajae-code/natives export
const EllipsisValue = '…';
export const Ellipsis: string & { Unicode: string; Ascii: string; Omit: string } = Object.assign(
    EllipsisValue,
    { Unicode: '…', Ascii: '...', Omit: '⋯' },
);
export type Ellipsis = string;

export function nativeHighlightCode(code: string, _lang: string): string { return code; }
export function encodeSixel(_data: Uint8Array, _w: number, _h: number): string { return ""; }

// theme.ts requires these exact named exports from @gajae-code/natives
export function highlightCode(code: string, _lang: string, _colors: Record<string, string>): string { return code; }
export function supportsLanguage(_lang: string): boolean { return false; }
export function detectMacOSAppearance(): 'dark' | 'light' | null { return 'dark'; }
export type HighlightColors = Record<string, string>;

export const MacAppearanceObserver = {
    start(cb: (err: Error | null, appearance: string) => void): { stop(): void } {
        return { stop() {} };
    },
};
