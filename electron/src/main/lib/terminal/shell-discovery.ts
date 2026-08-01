import { existsSync } from 'node:fs';

const SHELLS: Record<string, string[]> = {
    darwin: ['/bin/zsh', '/bin/bash', '/bin/sh'],
    linux: ['/bin/bash', '/bin/zsh', '/bin/sh'],
    win32: ['powershell.exe', 'cmd.exe'],
};

export function discoverShell(): string {
    const envShell = process.env.SHELL;
    if (envShell && existsSync(envShell)) return envShell;
    const candidates = SHELLS[process.platform] ?? ['/bin/sh'];
    for (const s of candidates) {
        if (existsSync(s)) return s;
    }
    return candidates[0] ?? '/bin/sh';
}
