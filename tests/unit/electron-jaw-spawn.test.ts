import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hasDashboardCommand, spawnJawDashboard } from '../../electron/src/main/lib/jaw-spawn.ts';
import { RingBuffer } from '../../electron/src/main/lib/ring-buffer.ts';

function writeExecutable(
    dir: string,
    name: string,
    unixContent: string,
    windowsContent: string,
): string {
    const file = join(dir, process.platform === 'win32' ? `${name}.cmd` : name);
    writeFileSync(file, process.platform === 'win32' ? windowsContent : unixContent, 'utf8');
    chmodSync(file, 0o755);
    return file;
}

test('electron spawn rejects stale binaries without dashboard command', () => {
    const dir = mkdtempSync(join(tmpdir(), 'weasley-podex-electron-spawn-'));
    try {
        const staleBinary = writeExecutable(dir, 'weasley-podex-stale', `#!/bin/sh
if [ "$1" = "dashboard" ]; then
  echo "Unknown command: dashboard" >&2
  exit 1
fi
exit 0
`, `@echo off
if "%~1"=="dashboard" (
  echo Unknown command: dashboard 1>&2
  exit /b 1
)
exit /b 0
`);

        assert.equal(hasDashboardCommand(staleBinary), false);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('electron spawn accepts Weasley Podex binaries with dashboard subcommands', () => {
    const dir = mkdtempSync(join(tmpdir(), 'weasley-podex-electron-spawn-'));
    try {
        const currentBinary = writeExecutable(dir, 'weasley-podex-current', `#!/bin/sh
if [ "$1" = "dashboard" ]; then
  echo "Unknown dashboard command: $2" >&2
  echo "Usage: weasley-podex dashboard serve [options]" >&2
  exit 1
fi
exit 0
`, `@echo off
if "%~1"=="dashboard" (
  echo Unknown dashboard command: %~2 1>&2
  echo Usage: weasley-podex dashboard serve [options] 1>&2
  exit /b 1
)
exit /b 0
`);

        assert.equal(hasDashboardCommand(currentBinary), true);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('electron spawn suppresses external browser open for owned manager', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'weasley-podex-electron-spawn-'));
    try {
        const currentBinary = writeExecutable(dir, 'weasley-podex-current', `#!/bin/sh
printf '%s\\n' "$@"
exit 0
`, `@echo off
:print_args
if "%~1"=="" goto done
echo %~1
shift
goto print_args
:done
exit /b 0
`);
        const ringBuffer = new RingBuffer();
        const child = spawnJawDashboard(currentBinary, { port: 24577, ringBuffer });
        const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
            child.once('error', reject);
            child.once('close', (code, signal) => resolve({ code, signal }));
        });

        assert.equal(result.code, 0);
        assert.equal(result.signal, null);
        assert.deepEqual(ringBuffer.read().trim().split(/\r?\n/), [
            'dashboard',
            'serve',
            '--port',
            '24577',
            '--no-open',
        ]);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
