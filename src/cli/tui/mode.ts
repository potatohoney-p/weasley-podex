/**
 * TUI display mode resolution (line-mode vs alt-screen). Phase 4 flag gate.
 */

export type TuiDisplayMode = 'line' | 'fullscreen';

export interface TuiModeOptions {
    fullscreenFlag?: boolean | undefined;
    classicFlag?: boolean | undefined;
    settingsFullscreen?: boolean | undefined;
    isTTY?: boolean | undefined;
    term?: string | undefined;
    rows?: number | undefined;
}

/** CLI flag > env JAW_TUI_FULLSCREEN > settings.tui.fullscreen > default fullscreen. */
export function resolveTuiDisplayMode(opts: TuiModeOptions = {}): TuiDisplayMode {
    const isTTY = opts.isTTY ?? Boolean(process.stdout.isTTY);
    const term = opts.term ?? process.env['TERM'] ?? '';
    const rows = opts.rows ?? process.stdout.rows ?? 24;

    if (opts.classicFlag) return 'line';
    if (!isTTY || term === 'dumb' || rows < 10) return 'line';

    if (opts.fullscreenFlag === true) return 'fullscreen';
    if (opts.fullscreenFlag === false) return 'line';

    const env = process.env['JAW_TUI_FULLSCREEN'];
    if (env === '1' || env === 'true') return 'fullscreen';
    if (env === '0' || env === 'false') return 'line';

    if (opts.settingsFullscreen === false) return 'line';
    return 'fullscreen';
}
