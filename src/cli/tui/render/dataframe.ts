/**
 * Render a `dataframe` structured fence as a box-drawing ASCII table for the TUI.
 *
 * Supports two shapes:
 *   - DataframeSpec  { columns: string[], rows: string[][] }
 *   - Array of objects  [{ col: val, … }, …]
 */

import { visualWidth } from '../renderers.js';
import { paint, attr, BOLD, DIM } from '../theme.js';

// ── types ──────────────────────────────────────────────────────────────────

interface DataframeSpec {
    columns: string[];
    rows: string[][];
}

// ── helpers ────────────────────────────────────────────────────────────────

const MAX_CELL = 60;

function cellText(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    const s = String(value).trim();
    return s.length > MAX_CELL ? `${s.slice(0, MAX_CELL - 1)}…` : s;
}

/** Pad/truncate a string to exactly `width` visible columns (CJK-aware). */
function padCell(s: string, width: number): string {
    const vw = visualWidth(s);
    if (vw > width) {
        // Truncate character-by-character until we fit (CJK chars are 2 wide).
        let out = '';
        let used = 0;
        for (const ch of s) {
            const cw = visualWidth(ch);
            if (used + cw > width - 1) { out += '…'; used += 1; break; }
            out += ch;
            used += cw;
        }
        return out + ' '.repeat(Math.max(0, width - used));
    }
    return s + ' '.repeat(width - vw);
}

// ── parse ──────────────────────────────────────────────────────────────────

function parseDataframe(json: string): DataframeSpec | null {
    let raw: unknown;
    try { raw = JSON.parse(json); } catch { return null; }

    // Shape 1: { columns, rows }
    if (
        raw !== null && typeof raw === 'object' && !Array.isArray(raw) &&
        'columns' in raw && 'rows' in raw
    ) {
        const spec = raw as { columns: unknown; rows: unknown };
        if (Array.isArray(spec.columns) && Array.isArray(spec.rows)) {
            return {
                columns: (spec.columns as unknown[]).map(cellText),
                rows: (spec.rows as unknown[]).map(r =>
                    Array.isArray(r) ? (r as unknown[]).map(cellText) : [cellText(r)],
                ),
            };
        }
    }

    // Shape 2: array of objects
    if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'object' && raw[0] !== null) {
        const columns = Object.keys(raw[0] as object);
        const rows = (raw as object[]).map(obj =>
            columns.map(k => cellText((obj as Record<string, unknown>)[k])),
        );
        return { columns, rows };
    }

    return null;
}

// ── render ─────────────────────────────────────────────────────────────────

export function renderDataframeBlock(json: string, termWidth: number): string {
    const spec = parseDataframe(json);
    if (!spec) return json; // graceful fallback

    const { columns, rows } = spec;
    if (columns.length === 0) return json;

    // Compute natural column widths (header vs. all cells).
    const colWidths: number[] = columns.map((h, ci) => {
        const headerW = visualWidth(h);
        const maxDataW = rows.reduce((mx, row) => {
            const cell = row[ci] ?? '';
            return Math.max(mx, visualWidth(cell));
        }, 0);
        return Math.max(headerW, maxDataW, 1);
    });

    // Shrink columns proportionally so the full table fits termWidth.
    // Table overhead: 1 (left border) + colCount * 3 (pad+sep) - 1 (last sep has no right gap)
    // i.e.  left│ + (col + │) * n  →  1 + sum(widths) + 3*(n-1) + 2 + 1 = sum + 3n + 1
    const overhead = 1 + columns.length * 3; // │ space content space │ per col
    let totalContent = colWidths.reduce((a, b) => a + b, 0);
    const available = termWidth - overhead;

    if (totalContent > available && available > columns.length) {
        const budget = Math.max(available, columns.length);
        const scale = budget / (totalContent || 1);
        for (let i = 0; i < colWidths.length; i++) {
            colWidths[i] = Math.max(1, Math.floor((colWidths[i] ?? 1) * scale));
        }
        totalContent = colWidths.reduce((a, b) => a + b, 0);
    }

    // Box-drawing helpers.
    const hr = (l: string, m: string, r: string, fill: string) =>
        l + colWidths.map(w => fill.repeat(w + 2)).join(m) + r;

    const top    = hr('┌', '┬', '┐', '─');
    const divider = hr('├', '┼', '┤', '─');
    const bottom = hr('└', '┴', '┘', '─');

    const renderRow = (cells: string[], styled: boolean): string => {
        const parts = colWidths.map((w, i) => {
            const raw = cells[i] ?? '';
            const padded = padCell(raw, w);
            return styled
                ? paint('heading', padded, BOLD)
                : padded;
        });
        return '│ ' + parts.join(' │ ') + ' │';
    };

    const lines: string[] = [];
    lines.push(attr(top, DIM));
    lines.push(renderRow(columns, true));
    lines.push(attr(divider, DIM));
    for (const row of rows) {
        lines.push(renderRow(row, false));
    }
    lines.push(attr(bottom, DIM));

    return lines.join('\n');
}
