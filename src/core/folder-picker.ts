// ─── Native folder picker (#233 follow-up: clickable Project button) ──
// The server always runs on the user's machine, so it can open the OS
// folder chooser (Finder on macOS) and hand the picked path back to the
// browser — something a plain web page can never do with absolute paths.

import { execFile } from 'node:child_process';

export const PICKER_TIMEOUT_MS = 5 * 60_000; // dialog waits for a human

export type PickResult =
    | { status: 'picked'; path: string }
    | { status: 'cancelled' }
    | { status: 'busy' }
    | { status: 'unavailable'; reason: string };

export type ExecImpl = (
    cmd: string,
    args: string[],
    callback: (error: (Error & { code?: number | string }) | null, stdout: string, stderr: string) => void,
) => void;

const defaultExec: ExecImpl = (cmd, args, cb) => {
    execFile(cmd, args, { timeout: PICKER_TIMEOUT_MS }, (error, stdout, stderr) => {
        cb(error as (Error & { code?: number | string }) | null, String(stdout), String(stderr));
    });
};

function commandFor(platform: NodeJS.Platform, prompt: string): { cmd: string; args: string[] } | null {
    if (platform === 'darwin') {
        return {
            cmd: 'osascript',
            args: [
                '-e', 'tell application "System Events" to activate',
                '-e', `POSIX path of (choose folder with prompt ${JSON.stringify(prompt)})`,
            ],
        };
    }
    if (platform === 'win32') {
        const script = '[System.Reflection.Assembly]::LoadWithPartialName("System.Windows.Forms") | Out-Null; '
            + `$d = New-Object System.Windows.Forms.FolderBrowserDialog; $d.Description = ${JSON.stringify(prompt)}; `
            + 'if ($d.ShowDialog() -eq "OK") { Write-Output $d.SelectedPath }';
        return { cmd: 'powershell', args: ['-NoProfile', '-STA', '-Command', script] };
    }
    if (platform === 'linux') {
        return { cmd: 'zenity', args: ['--file-selection', '--directory', `--title=${prompt}`] };
    }
    return null;
}

let dialogOpen = false;

/** Open the OS folder chooser. One dialog at a time — concurrent calls get
 *  'busy' instead of stacking modal dialogs on the user's screen. */
export function pickFolderNative(options: {
    prompt?: string;
    platform?: NodeJS.Platform;
    execImpl?: ExecImpl;
} = {}): Promise<PickResult> {
    const prompt = options.prompt ?? 'Select the project root folder';
    const platform = options.platform ?? process.platform;
    const execImpl = options.execImpl ?? defaultExec;

    const spec = commandFor(platform, prompt);
    if (!spec) {
        return Promise.resolve({ status: 'unavailable', reason: `no folder dialog for platform ${platform}` });
    }
    if (dialogOpen) return Promise.resolve({ status: 'busy' });
    dialogOpen = true;

    return new Promise<PickResult>((resolvePick) => {
        execImpl(spec.cmd, spec.args, (error, stdout, stderr) => {
            dialogOpen = false;
            const picked = stdout.trim();
            if (!error && picked) {
                resolvePick({ status: 'picked', path: picked });
                return;
            }
            // osascript/zenity exit 1 on user cancel; powershell prints nothing.
            const cancelled = (!error && !picked)
                || (error && (stderr.includes('User canceled') || error.code === 1));
            if (cancelled) {
                resolvePick({ status: 'cancelled' });
                return;
            }
            resolvePick({
                status: 'unavailable',
                reason: stderr.trim() || (error ? error.message : 'folder dialog failed'),
            });
        });
    });
}
