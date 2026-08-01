import type { AutocompleteState, RenderAutocompleteOptions } from './overlay.js';
import type { OverlayItem } from '../types.js';

type SlashSurfaceOptions = Pick<RenderAutocompleteOptions, 'columns' | 'dimCode' | 'resetCode' | 'clipTextToCols'>;

function displayValue(item: OverlayItem, stage: string): string {
    return stage === 'argument' ? item.name : `/${item.name}`;
}

function formatSlashRow(
    item: OverlayItem,
    selected: boolean,
    stage: string,
    options: SlashSurfaceOptions,
): string {
    const valueCol = stage === 'argument' ? 24 : 18;
    const value = displayValue(item, stage);
    const valueText = value.length >= valueCol ? value.slice(0, valueCol) : value.padEnd(valueCol, ' ');
    const desc = item.desc || item.commandDesc || '';
    const raw = `  ${valueText}  ${desc}`;
    const line = options.clipTextToCols(raw, Math.max(1, options.columns));
    return selected ? `\x1b[7m${line}${options.resetCode}` : `${options.dimCode}${line}${options.resetCode}`;
}

export function composeSlashSurfaceLines(
    state: AutocompleteState,
    options: SlashSurfaceOptions,
): string[] {
    if (!state.open || state.items.length === 0 || state.visibleRows <= 0) return [];
    const lines: string[] = [];
    if (state.contextHeader) {
        lines.push(`${options.dimCode}${options.clipTextToCols(`  ${state.contextHeader}`, Math.max(1, options.columns))}${options.resetCode}`);
    }
    const start = state.windowStart;
    const end = Math.min(state.items.length, start + state.visibleRows);
    for (let i = start; i < end; i++) {
        const item = state.items[i];
        if (!item) continue;
        lines.push(formatSlashRow(item, i === state.selected, state.stage, options));
    }
    if (state.items.length > state.visibleRows) {
        const current = Math.min(state.items.length, state.selected + 1);
        lines.push(`${options.dimCode}${options.clipTextToCols(`  (${current}/${state.items.length})`, Math.max(1, options.columns))}${options.resetCode}`);
    }
    return lines.map(line => line.replace(/\n/g, ' '));
}
