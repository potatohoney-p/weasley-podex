/**
 * External editor escape for the TUI composer (Phase 3, doc 08).
 * Ctrl+X Ctrl+E → temp file → $VISUAL || $EDITOR || vi → read back.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function editorCommand(): string {
    const visual = process.env['VISUAL']?.trim();
    if (visual) return visual;
    const editor = process.env['EDITOR']?.trim();
    if (editor) return editor;
    return 'vi';
}

/** Open the system editor on `initial`, return the edited buffer (or initial on failure). */
export function openExternalEditor(initial: string): string {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jaw-tui-edit-'));
    const tmpFile = path.join(tmpDir, 'compose.txt');
    try {
        fs.writeFileSync(tmpFile, initial, 'utf8');
        const cmd = editorCommand();
        const proc = spawnSync(cmd, [tmpFile], {
            stdio: 'inherit',
            env: process.env,
        });
        if (proc.error) throw proc.error;
        if (proc.status !== 0) return initial;
        return fs.readFileSync(tmpFile, 'utf8');
    } catch {
        return initial;
    } finally {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best-effort */ }
    }
}
