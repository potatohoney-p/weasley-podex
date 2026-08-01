import { getWeasleyPodexEnv } from '../../../../src/core/weasley-podex-env.js';
import { spawn } from 'node:child_process';

type LogSink = {
  append(message: string): void;
};

type PrimeMacAutomationPermissionOptions = {
  log?: LogSink;
  onBlocked?: (reason: string) => void;
};

const AUTOMATION_PRIME_TIMEOUT_MS = 60_000;
const MAX_CAPTURED_OUTPUT = 4_000;

const AUTOMATION_PRIME_SCRIPT = [
  'set chromeRunning to false',
  'tell application "System Events"',
  '  set chromeRunning to exists process "Google Chrome"',
  '  count processes',
  'end tell',
  'if chromeRunning then',
  '  tell application id "com.google.Chrome" to count windows',
  'end if',
];

function appendChunk(current: string, chunk: Buffer): string {
  const next = `${current}${chunk.toString('utf8')}`;
  if (next.length <= MAX_CAPTURED_OUTPUT) return next;
  return next.slice(next.length - MAX_CAPTURED_OUTPUT);
}

function reportBlocked(opts: PrimeMacAutomationPermissionOptions, message: string): void {
  opts.log?.append(`[automation permission prime blocked] ${message}\n`);
  opts.onBlocked?.(message);
}

export function primeMacAutomationPermission(opts: PrimeMacAutomationPermissionOptions = {}): void {
  if (process.platform !== 'darwin') return;
  if (getWeasleyPodexEnv('SKIP_AUTOMATION_PRIME') === '1') return;

  try {
    const args = AUTOMATION_PRIME_SCRIPT.flatMap((line) => ['-e', line]);
    const child = spawn('/usr/bin/osascript', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      try {
        child.kill('SIGTERM');
      } catch (err) {
        opts.log?.append(`[automation permission prime kill error] ${(err as Error).message}\n`);
      }
    }, AUTOMATION_PRIME_TIMEOUT_MS);

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout = appendChunk(stdout, chunk);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr = appendChunk(stderr, chunk);
    });
    child.once('error', (err) => {
      clearTimeout(timeout);
      reportBlocked(opts, err.message);
    });
    child.once('exit', (code, signal) => {
      clearTimeout(timeout);
      if (code === 0) {
        opts.log?.append('[automation permission prime] AppleEvents prompt check completed\n');
        return;
      }
      const detail = stderr.trim() || stdout.trim() || `code=${code ?? 'null'} signal=${signal ?? 'null'}`;
      const reason = timedOut ? 'timed out waiting for macOS permission prompt' : detail;
      reportBlocked(opts, reason);
    });
  } catch (err) {
    reportBlocked(opts, (err as Error).message);
  }
}
