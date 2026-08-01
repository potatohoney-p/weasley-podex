import { getWeasleyPodexEnv } from '../../../../src/core/weasley-podex-env.js';
import { spawn, type ChildProcess, execFileSync } from 'node:child_process';
import { existsSync, statSync, readdirSync, accessSync, constants, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { RingBuffer } from './ring-buffer.js';

const PRIMARY_CLI = 'weasley-podex';

let pathFixed = false;
async function ensureFixedPath(): Promise<void> {
  if (pathFixed) return;
  pathFixed = true;
  try {
    const mod = await import('fix-path');
    const fn = (mod as unknown as { default?: () => void }).default ?? (mod as unknown as () => void);
    if (typeof fn === 'function') fn();
  } catch {
    // fix-path is optional; ignore in dev
  }
}

function isExecutable(p: string): boolean {
  try {
    const st = statSync(p);
    if (!st.isFile()) return false;
    accessSync(p, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function shellScriptInvocation(binary: string, args: string[]): { command: string; args: string[]; shell?: boolean } {
  if (process.platform === 'win32' && binary.endsWith('.cmd')) {
    return { command: binary, args, shell: true };
  }
  if (process.platform !== 'win32') {
    try {
      const head = readFileSync(binary, 'utf8').slice(0, 80);
      if (head.startsWith('#!') && /\/(?:ba|z|k)?sh\b/.test(head.split(/\r?\n/, 1)[0] ?? '')) {
        return { command: '/bin/sh', args: [binary, ...args] };
      }
    } catch {
      // Fall through to direct execution; executability was checked separately.
    }
  }
  return { command: binary, args };
}

function whichCandidates(commandName: string): string[] {
  try {
    const command = process.platform === 'win32' ? 'where' : 'which';
    const args = process.platform === 'win32' ? [commandName] : ['-a', commandName];
    const out = execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return out
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    // not found
  }
  return [];
}

function commandOutputFromError(error: unknown): string {
  const err = error as { stdout?: unknown; stderr?: unknown; message?: unknown };
  const stdout = Buffer.isBuffer(err.stdout) ? err.stdout.toString('utf8') : String(err.stdout ?? '');
  const stderr = Buffer.isBuffer(err.stderr) ? err.stderr.toString('utf8') : String(err.stderr ?? '');
  const message = typeof err.message === 'string' ? err.message : '';
  return `${stdout}\n${stderr}\n${message}`;
}

export function hasDashboardCommand(binary: string): boolean {
  if (!isExecutable(binary)) return false;
  try {
    const invocation = shellScriptInvocation(binary, ['dashboard', '__weasley_podex_electron_probe__']);
    execFileSync(invocation.command, invocation.args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 2000,
      ...(invocation.shell ? { shell: true } : {}),
    });
    return true;
  } catch (error) {
    const output = commandOutputFromError(error);
    return (
      output.includes('Unknown dashboard command: __weasley_podex_electron_probe__') ||
      output.includes('Usage: weasley-podex dashboard') ||
      output.includes('weasley-podex dashboard serve')
    );
  }
}

function addCandidate(candidate: string, searched: string[], seen: Set<string>, label = candidate): string | null {
  if (seen.has(candidate)) return null;
  seen.add(candidate);
  if (!isExecutable(candidate)) {
    searched.push(`${label} (not executable)`);
    return null;
  }
  if (!hasDashboardCommand(candidate)) {
    searched.push(`${label} (no dashboard support)`);
    return null;
  }
  searched.push(label);
  return candidate;
}

function expandNvmCandidates(commandName: string): string[] {
  const out: string[] = [];
  const nvmDir = join(homedir(), '.nvm', 'versions', 'node');
  if (!existsSync(nvmDir)) return out;
  try {
    for (const ver of readdirSync(nvmDir)) {
      out.push(join(nvmDir, ver, 'bin', commandName));
    }
  } catch {
    // ignore
  }
  return out;
}

function buildCandidateList(commandName: string): string[] {
  const cands: string[] = [];
  cands.push(join('/opt/homebrew/bin', commandName));
  cands.push(join('/usr/local/bin', commandName));
  cands.push(join(homedir(), '.local', 'bin', commandName));
  cands.push(...expandNvmCandidates(commandName));
  cands.push(join(homedir(), '.volta', 'bin', commandName));
  cands.push(join(homedir(), '.fnm', 'aliases', 'default', 'bin', commandName));
  cands.push(join(homedir(), '.fnm', 'current', 'bin', commandName));
  return cands;
}

function bundledSidecarPath(commandName: string): string {
  return process.platform === 'win32'
    ? join(process.resourcesPath, 'server', 'bin', `${commandName}.cmd`)
    : join(process.resourcesPath, 'server', 'bin', commandName);
}

function lookupLabel(commandName: string): string {
  return process.platform === 'win32' ? `where ${commandName}` : `which -a ${commandName}`;
}

function findCommandCandidate(
  commandName: string,
  searched: string[],
  seen: Set<string>,
): string | null {
  const lookup = lookupLabel(commandName);
  const discovered = whichCandidates(commandName);
  if (discovered.length === 0) searched.push(`${lookup} → (not found)`);
  for (const candidate of discovered) {
    const found = addCandidate(candidate, searched, seen, `${lookup} → ${candidate}`);
    if (found) return found;
  }
  for (const candidate of buildCandidateList(commandName)) {
    const found = addCandidate(candidate, searched, seen);
    if (found) return found;
  }
  return null;
}

export interface FindResult {
  path: string | null;
  searched: string[];
}

export async function findJawBinary(): Promise<FindResult> {
  await ensureFixedPath();
  const searched: string[] = [];
  const seen = new Set<string>();

  const electron = await import('electron');
  if (electron.app.isPackaged) {
    const found = addCandidate(
      bundledSidecarPath(PRIMARY_CLI),
      searched,
      seen,
      `bundled sidecar (${PRIMARY_CLI})`,
    );
    if (found) return { path: found, searched };
  }

  const configuredBin = getWeasleyPodexEnv('BIN');
  if (configuredBin) {
    const found = addCandidate(
      configuredBin,
      searched,
      seen,
      `$WEASLEY_PODEX_BIN=${configuredBin}`,
    );
    if (found) return { path: found, searched };
  }

  const primary = findCommandCandidate(PRIMARY_CLI, searched, seen);
  if (primary) return { path: primary, searched };

  return { path: null, searched };
}

export interface SpawnOptions {
  port: number;
  ringBuffer: RingBuffer;
  env?: NodeJS.ProcessEnv;
}

export function spawnJawDashboard(
  binary: string,
  opts: SpawnOptions,
): ChildProcess {
  const invocation = shellScriptInvocation(binary, ['dashboard', 'serve', '--port', String(opts.port), '--no-open']);
  const env = { ...process.env, ...(opts.env ?? {}) };
  const configuredHome = getWeasleyPodexEnv('HOME', env);
  if (configuredHome) env.WEASLEY_PODEX_HOME = configuredHome;
  const child = spawn(invocation.command, invocation.args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env,
    detached: false,
    ...(invocation.shell ? { shell: true } : {}),
  });
  child.stdout?.on('data', (d) => opts.ringBuffer.append(d));
  child.stderr?.on('data', (d) => opts.ringBuffer.append(d));
  return child;
}

export async function gracefulShutdown(
  child: ChildProcess,
  timeoutMs = 5000,
): Promise<void> {
  if (!child.pid || child.exitCode !== null) return;
  return new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    child.once('exit', finish);
    try {
      child.kill('SIGTERM');
    } catch {
      finish();
      return;
    }
    setTimeout(() => {
      if (done) return;
      try {
        child.kill('SIGKILL');
      } catch {
        // ignore
      }
      finish();
    }, timeoutMs);
  });
}
