#!/usr/bin/env node
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function usage() {
  console.log(`Usage: verify-release-evidence.mjs --macos DIR --wsl DIR [options]

Options:
  --macos DIR       Strict macOS fresh-machine evidence directory.
  --wsl DIR         Strict Windows-via-WSL fresh-machine evidence directory.
  --auditor FILE    Auditor script path. Defaults to sibling audit-fresh-install-evidence.mjs.
  -h, --help        Show this help.

This is the release gate. It intentionally does not pass any --allow-* local-smoke
flags to the per-target auditor.
`);
}

const args = process.argv.slice(2);
let macosDir = '';
let wslDir = '';
let auditor = path.join(__dirname, 'audit-fresh-install-evidence.mjs');
const currentScripts = {
  collector: path.join(__dirname, 'collect-fresh-install-evidence.sh'),
  verifier: path.join(__dirname, 'verify-fresh-install.sh'),
  macosInstaller: path.join(__dirname, 'install.sh'),
  wslInstaller: path.join(__dirname, 'install-wsl.sh'),
};

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '-h' || arg === '--help') {
    usage();
    process.exit(0);
  }
  if (arg === '--macos') {
    macosDir = args[++i] || '';
    continue;
  }
  if (arg === '--wsl') {
    wslDir = args[++i] || '';
    continue;
  }
  if (arg === '--auditor') {
    auditor = args[++i] || '';
    continue;
  }
  throw new Error(`unknown option: ${arg}`);
}

const failures = [];
if (!macosDir) failures.push('missing --macos DIR');
if (!wslDir) failures.push('missing --wsl DIR');
if (macosDir && wslDir && path.resolve(macosDir) === path.resolve(wslDir)) {
  failures.push('--macos and --wsl must point to different evidence directories');
}
if (!auditor) failures.push('missing --auditor FILE');

function requireDirectory(label, dir) {
  if (!dir) return;
  if (!fs.existsSync(dir)) {
    failures.push(`${label} evidence directory does not exist: ${dir}`);
    return;
  }
  if (!fs.statSync(dir).isDirectory()) {
    failures.push(`${label} evidence path is not a directory: ${dir}`);
  }
}

function requireFile(label, file) {
  if (!file) return;
  if (!fs.existsSync(file)) {
    failures.push(`${label} file does not exist: ${file}`);
    return;
  }
  if (!fs.statSync(file).isFile()) {
    failures.push(`${label} path is not a file: ${file}`);
  }
}

requireDirectory('macOS', macosDir);
requireDirectory('Windows-via-WSL', wslDir);
requireFile('auditor', auditor);
requireFile('current collector', currentScripts.collector);
requireFile('current verifier', currentScripts.verifier);
requireFile('current macOS installer', currentScripts.macosInstaller);
requireFile('current WSL installer', currentScripts.wslInstaller);

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function requireEvidenceScriptMatches(label, evidenceDir, evidenceFile, currentFile) {
  if (!evidenceDir || !currentFile) return;

  const archived = path.join(evidenceDir, evidenceFile);
  if (!fs.existsSync(archived)) {
    failures.push(`${label} archived script missing: ${archived}`);
    return;
  }
  if (!fs.statSync(archived).isFile()) {
    failures.push(`${label} archived script path is not a file: ${archived}`);
    return;
  }

  const archivedHash = sha256(archived);
  const currentHash = sha256(currentFile);
  if (archivedHash !== currentHash) {
    failures.push(`${label} archived ${evidenceFile} does not match current ${path.basename(currentFile)}: evidence=${archivedHash} current=${currentHash}`);
  }
}

function runAudit(label, dir, target) {
  console.log(`[release-evidence] RUN ${label}: ${dir}`);
  const result = spawnSync(process.execPath, [auditor, dir, '--target', target], {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
    stdio: 'pipe',
    shell: false,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    failures.push(`${label} audit failed with exit ${result.status ?? 'signal'}`);
    return;
  }
  console.log(`[release-evidence] PASS ${label}`);
}

if (!failures.length) {
  runAudit('macOS', macosDir, 'macos');
  runAudit('Windows-via-WSL', wslDir, 'wsl');
}

if (!failures.length) {
  requireEvidenceScriptMatches('macOS', macosDir, '00-collector-script.sh', currentScripts.collector);
  requireEvidenceScriptMatches('macOS', macosDir, '02-installer-script.sh', currentScripts.macosInstaller);
  requireEvidenceScriptMatches('macOS', macosDir, '21-verifier-script.sh', currentScripts.verifier);
  requireEvidenceScriptMatches('Windows-via-WSL', wslDir, '00-collector-script.sh', currentScripts.collector);
  requireEvidenceScriptMatches('Windows-via-WSL', wslDir, '02-installer-script.sh', currentScripts.wslInstaller);
  requireEvidenceScriptMatches('Windows-via-WSL', wslDir, '21-verifier-script.sh', currentScripts.verifier);
}

if (failures.length) {
  console.error('[release-evidence] FAIL');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('[release-evidence] ALL PASS');
