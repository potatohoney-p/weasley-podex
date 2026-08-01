import { toGraphemes } from './text-buffer.js';

export function visualWidth(str: string): number {
    // Strip ANSI escape codes first so width matches visible cells.
    const stripped = str.replace(/\x1b\[[0-9;]*m/g, '');
    let width = 0;
    for (const ch of stripped) {
        const cp = ch.codePointAt(0);
        if (cp === undefined) {
            width += 1;
            continue;
        }
        if ((cp >= 0x0300 && cp <= 0x036F) || (cp >= 0xFE00 && cp <= 0xFE0F)) {
            continue;
        }
        if ((cp >= 0x1100 && cp <= 0x115F) || (cp >= 0x2E80 && cp <= 0x303E) ||
            (cp >= 0x3040 && cp <= 0x33BF) || (cp >= 0x3400 && cp <= 0x4DBF) ||
            (cp >= 0x4E00 && cp <= 0xA4CF) || (cp >= 0xA960 && cp <= 0xA97C) ||
            (cp >= 0xAC00 && cp <= 0xD7AF) || (cp >= 0xD7B0 && cp <= 0xD7FF) ||
            (cp >= 0xF900 && cp <= 0xFAFF) || (cp >= 0xFE30 && cp <= 0xFE6F) ||
            (cp >= 0xFF01 && cp <= 0xFF60) || (cp >= 0xFFE0 && cp <= 0xFFE6) ||
            cp === 0x23F3 || cp === 0x231B ||
            (cp >= 0x1F000 && cp <= 0x1FFFF) || (cp >= 0x20000 && cp <= 0x2FA1F)) {
            width += 2;
        } else {
            width += 1;
        }
    }
    return width;
}

export function clipTextToCols(str: string, maxCols: number): string {
    if (maxCols <= 0) return '';
    let out = '';
    let width = 0;
    let pos = 0;
    let sawAnsi = false;
    while (pos < str.length) {
        // Pass ANSI CSI sequences through without counting width
        if (str.charCodeAt(pos) === 0x1b && pos + 1 < str.length && str[pos + 1] === '[') {
            const start = pos;
            pos += 2;
            while (pos < str.length && !(str.charCodeAt(pos) >= 0x40 && str.charCodeAt(pos) <= 0x7e)) pos++;
            if (pos >= str.length) break;
            pos++;
            out += str.slice(start, pos);
            sawAnsi = true;
            continue;
        }
        const code = str.codePointAt(pos);
        if (code === undefined) break;
        const ch = String.fromCodePoint(code);
        const cw = charCellWidth(code);
        if (width + cw > maxCols) break;
        out += ch;
        width += cw;
        pos += ch.length;
    }
    return sawAnsi ? `${out}\x1b[0m` : out;
}

function parseAnsiCsi(text: string, pos: number): { value: string; next: number } | null {
    if (text.charCodeAt(pos) !== 0x1b || pos + 1 >= text.length || text[pos + 1] !== '[') return null;
    let end = pos + 2;
    while (end < text.length && !(text.charCodeAt(end) >= 0x40 && text.charCodeAt(end) <= 0x7e)) end++;
    if (end >= text.length) return null;
    return { value: text.slice(pos, end + 1), next: end + 1 };
}

function updateActiveSgr(active: string, seq: string): string {
    if (!seq.endsWith('m')) return active;
    if (seq === '\x1b[0m') return '';
    return seq;
}

export function wrapTextToCols(str: string, maxCols: number): string[] {
    const safeCols = Math.max(1, maxCols);
    const rows: string[] = [];

    for (const logicalLine of str.split('\n')) {
        if (logicalLine.length === 0) {
            rows.push('');
            continue;
        }

        let pos = 0;
        let out = '';
        let width = 0;
        let activeSgr = '';
        let rowSawAnsi = false;

        const pushRow = (): void => {
            rows.push(rowSawAnsi && activeSgr && !out.endsWith('\x1b[0m') ? `${out}\x1b[0m` : out);
            out = activeSgr;
            width = 0;
            rowSawAnsi = Boolean(activeSgr);
        };

        while (pos < logicalLine.length) {
            const ansi = parseAnsiCsi(logicalLine, pos);
            if (ansi) {
                out += ansi.value;
                activeSgr = updateActiveSgr(activeSgr, ansi.value);
                rowSawAnsi = true;
                pos = ansi.next;
                continue;
            }

            const code = logicalLine.codePointAt(pos);
            if (code === undefined) break;
            const ch = String.fromCodePoint(code);
            const cw = charCellWidth(code);
            if (width > 0 && width + cw > safeCols) {
                pushRow();
            }
            out += ch;
            width += cw;
            pos += ch.length;
        }

        if (out.length > 0 || rowSawAnsi) {
            rows.push(rowSawAnsi && activeSgr && !out.endsWith('\x1b[0m') ? `${out}\x1b[0m` : out);
        }
    }

    return rows.length > 0 ? rows : [''];
}

function charCellWidth(cp: number): number {
    if ((cp >= 0x0300 && cp <= 0x036F) || (cp >= 0xFE00 && cp <= 0xFE0F)) {
        return 0;
    }
    if ((cp >= 0x1100 && cp <= 0x115F) || (cp >= 0x2E80 && cp <= 0x303E) ||
        (cp >= 0x3040 && cp <= 0x33BF) || (cp >= 0x3400 && cp <= 0x4DBF) ||
        (cp >= 0x4E00 && cp <= 0xA4CF) || (cp >= 0xA960 && cp <= 0xA97C) ||
        (cp >= 0xAC00 && cp <= 0xD7AF) || (cp >= 0xD7B0 && cp <= 0xD7FF) ||
        (cp >= 0xF900 && cp <= 0xFAFF) || (cp >= 0xFE30 && cp <= 0xFE6F) ||
        (cp >= 0xFF01 && cp <= 0xFF60) || (cp >= 0xFFE0 && cp <= 0xFFE6) ||
        cp === 0x23F3 || cp === 0x231B ||
        (cp >= 0x1F000 && cp <= 0x1FFFF) || (cp >= 0x20000 && cp <= 0x2FA1F)) {
        return 2;
    }
    return 1;
}

/**
 * On-screen position of a cursor within rendered composer text. The display text
 * splits into logical lines by '\n' (first line uses firstPrefixWidth, the rest
 * contPrefixWidth); lines soft-wrap at `cols`. Returns the cursor screen {row,col}
 * and total rows rendered. Pure — used to place the terminal cursor after a redraw.
 */
export function cursorScreenPos(
    displayText: string,
    cursorOffset: number,
    firstPrefixWidth: number,
    contPrefixWidth: number,
    cols: number,
): { row: number; col: number; totalRows: number } {
    const safeCols = Math.max(1, cols);
    const g = toGraphemes(displayText);
    const cur = Math.max(0, Math.min(cursorOffset, g.length));
    let row = 0;
    let scol = firstPrefixWidth;
    let curRow = 0;
    let curCol = firstPrefixWidth;
    for (let i = 0; i <= g.length; i += 1) {
        if (i === cur) { curRow = row; curCol = scol; }
        if (i === g.length) break;
        const ch = g[i] ?? '';
        if (ch === '\n') { row += 1; scol = contPrefixWidth; continue; }
        const w = Math.max(1, visualWidth(ch));
        if (scol + w > safeCols) { row += 1; scol = 0; }
        scol += w;
    }
    return { row: curRow, col: curCol, totalRows: row + 1 };
}
