#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

function usage() {
  console.log(`Usage: audit-fresh-install-evidence.mjs DIR [options]

Options:
  --target macos|wsl|linux           Expected evidence target.
  --allow-skip-install               Allow evidence collected with --skip-install.
  --allow-skip-doctor                Allow verifier logs with --skip-doctor.
  --allow-preexisting-node           Allow Node.js to be present in 00-before.txt.
  --allow-missing-powershell-probe   Allow WSL evidence without 33-powershell-to-wsl-probe.log.
  -h, --help                         Show this help.
`);
}

const args = process.argv.slice(2);
const options = {
  target: '',
  allowSkipInstall: false,
  allowSkipDoctor: false,
  allowPreexistingNode: false,
  allowMissingPowerShellProbe: false,
};
let evidenceDir = '';

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '-h' || arg === '--help') {
    usage();
    process.exit(0);
  }
  if (arg === '--target') {
    const value = args[++i];
    if (!value) throw new Error('missing value for --target');
    options.target = value;
    continue;
  }
  if (arg === '--allow-skip-install') {
    options.allowSkipInstall = true;
    continue;
  }
  if (arg === '--allow-skip-doctor') {
    options.allowSkipDoctor = true;
    continue;
  }
  if (arg === '--allow-preexisting-node') {
    options.allowPreexistingNode = true;
    continue;
  }
  if (arg === '--allow-missing-powershell-probe') {
    options.allowMissingPowerShellProbe = true;
    continue;
  }
  if (arg.startsWith('-')) throw new Error(`unknown option: ${arg}`);
  if (evidenceDir) throw new Error(`unexpected extra argument: ${arg}`);
  evidenceDir = arg;
}

if (!evidenceDir) {
  usage();
  process.exit(2);
}

const failures = [];

function fail(message) {
  failures.push(message);
}

function readRequired(file) {
  const fullPath = path.join(evidenceDir, file);
  if (!fs.existsSync(fullPath)) {
    fail(`missing ${file}`);
    return '';
  }
  return fs.readFileSync(fullPath, 'utf8');
}

function readOptional(file) {
  const fullPath = path.join(evidenceDir, file);
  if (!fs.existsSync(fullPath)) return '';
  return fs.readFileSync(fullPath, 'utf8');
}

function requireIncludes(label, text, needle) {
  if (!text.includes(needle)) {
    fail(`${label} must include ${JSON.stringify(needle)}`);
  }
}

function requireMatch(label, text, pattern) {
  if (!pattern.test(text)) {
    fail(`${label} must match ${pattern}`);
  }
}

function summaryValue(summary, key) {
  const pattern = new RegExp(`\\b${key}=("[^"]*"|\\S*)`);
  for (const line of summary.split(/\r?\n/)) {
    const match = line.match(pattern);
    if (!match) continue;
    return match[1].replace(/^"|"$/g, '');
  }
  return '';
}

function hasFile(file) {
  return fs.existsSync(path.join(evidenceDir, file));
}

function hashFile(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(path.join(evidenceDir, file))).digest('hex');
}

function isBashScript(file) {
  const content = fs.readFileSync(path.join(evidenceDir, file), 'utf8');
  return content.startsWith('#!/usr/bin/env bash\n') || content.startsWith('#!/bin/bash\n');
}

function scriptRecord(summary, label) {
  const pattern = new RegExp(`\\bSCRIPT\\s+label="${label}"[^\\n]*\\bsha256="([a-fA-F0-9]{64})"`, 'm');
  const match = summary.match(pattern);
  return match?.[1]?.toLowerCase() || '';
}

function requireArchivedScript(label, file) {
  readRequired(file);
  if (!hasFile(file)) return;
  const recordedHash = scriptRecord(summary, label);
  if (!recordedHash) {
    fail(`summary.txt must include SCRIPT label="${label}" with a 64-hex sha256`);
    return;
  }
  const actualHash = hashFile(file);
  if (recordedHash !== actualHash) {
    fail(`${file} sha256 mismatch: summary=${recordedHash} actual=${actualHash}`);
  }
  if (!isBashScript(file)) {
    fail(`${file} must be an archived bash script with a bash shebang`);
  }
}

const summary = readRequired('summary.txt');
const before = readRequired('00-before.txt');
const after = readRequired('10-after.txt');
const verifier = readRequired('20-verify.log');
const summaryTarget = summaryValue(summary, 'target');
const target = options.target || summaryTarget;

if (!['macos', 'wsl', 'linux'].includes(target)) {
  fail(`unsupported or missing target: ${target || '(missing)'}`);
}
if (!summaryTarget) {
  fail('summary.txt must include target=macos|wsl|linux');
} else if (options.target && summaryTarget !== options.target) {
  fail(`summary.txt target=${summaryTarget} does not match --target ${options.target}`);
}

requireIncludes('summary.txt', summary, 'RESULT pass');
if (summary.includes('RESULT fail')) fail('summary.txt contains RESULT fail');
if (/DONE label="[^"]+" status=(?!0\b)\d+/.test(summary)) {
  fail('summary.txt contains a failed required command');
}

const skipInstall = summaryValue(summary, 'skip_install');
const skipDoctor = summaryValue(summary, 'skip_doctor');
if (!['0', '1'].includes(skipInstall)) {
  fail('summary.txt must include skip_install=0|1');
}
if (!['0', '1'].includes(skipDoctor)) {
  fail('summary.txt must include skip_doctor=0|1');
}
if (skipInstall === '1' && !options.allowSkipInstall) {
  fail('evidence was collected with --skip-install');
}
if (skipDoctor === '1' && !options.allowSkipDoctor) {
  fail('evidence was collected with --skip-doctor');
}

requireIncludes('00-before.txt', before, `target=${target}`);
requireIncludes('10-after.txt', after, `target=${target}`);
requireIncludes('20-verify.log', verifier, 'ALL PASS');
requireIncludes('20-verify.log', verifier, 'node version is >=22');
requireIncludes('20-verify.log', verifier, 'weasley-podex works:');
requireIncludes('20-verify.log', verifier, 'npm global bin is on PATH:');

if (skipDoctor === '1') {
  if (!options.allowSkipDoctor) fail('verifier skipped weasley-podex doctor');
} else {
  requireIncludes('20-verify.log', verifier, 'weasley-podex doctor completed');
}

if (!options.allowPreexistingNode && /^node=(?!missing$).+/m.test(before)) {
  fail('00-before.txt shows preexisting Node.js; expected a fresh no-Node machine');
}

for (const cmd of ['node', 'npm', 'weasley-podex', 'jaw', 'podex']) {
  requireMatch('10-after.txt', after, new RegExp(`^${cmd}=(?!missing$).+`, 'm'));
}

requireArchivedScript('collector', '00-collector-script.sh');

if (skipInstall !== '1') {
  readRequired('01-install.log');
  requireArchivedScript('installer', '02-installer-script.sh');
  requireInstallerForTarget('02-installer-script.sh', target);
  requireIncludes('summary.txt', summary, 'DONE label="Weasley Podex one-click installer" status=0');
}

requireArchivedScript('verifier', '21-verifier-script.sh');

function requireSuccessfulShellProbe(file) {
  const probe = readRequired(file);
  requireIncludes(file, probe, 'node_path=');
  requireIncludes(file, probe, 'npm_path=');
  requireIncludes(file, probe, 'weasley_podex_path=');
  requireMatch(file, probe, /Weasley Podex v\d+\./i);
}

function requireInstallerForTarget(file, expectedTarget) {
  const content = readRequired(file);
  if (!content) return;
  if (expectedTarget === 'wsl') {
    requireIncludes(file, content, 'WSL One-Click Installer');
    requireIncludes(file, content, 'HOME points to Windows path');
    return;
  }
  requireIncludes(file, content, 'One-Click Installer (macOS / Linux)');
  if (content.includes('WSL One-Click Installer')) {
    fail(`${file} must not be the WSL installer for target ${expectedTarget}`);
  }
}

if (target !== 'macos') {
  requireSuccessfulShellProbe('30-bash-login-probe.log');
}

if (target === 'macos') {
  requireIncludes('00-before.txt', before, 'ProductName:');
  requireMatch('00-before.txt', before, /^xcode_select=\/.+/m);

  readRequired('30-bash-login-probe.log');
  requireSuccessfulShellProbe('31-zsh-login-probe.log');
  requireSuccessfulShellProbe('32-zsh-interactive-probe.log');
}

if (target === 'wsl') {
  requireIncludes('20-verify.log', verifier, 'WSL bash login shell resolves node\/npm\/weasley-podex');
  requireMatch('00-before.txt', before, /microsoft|WSL|Ubuntu|Debian/i);
  if (hasFile('33-powershell-to-wsl-probe.log')) {
    const psProbe = readOptional('33-powershell-to-wsl-probe.log');
    requireMatch('33-powershell-to-wsl-probe.log', psProbe, /Weasley Podex v\d+\./i);
    const summaryHasHostProbeCommand = /RUN label="PowerShell-to-WSL Weasley Podex probe"[^\n]*\bwsl\.exe -d\b[^\n]*\bbash -lc\b/.test(summary);
    if (summary.includes('DONE label="PowerShell-to-WSL Weasley Podex probe" status=0')) {
      if (!summaryHasHostProbeCommand) {
        fail('summary.txt must record the PowerShell-to-WSL wsl.exe -d ... bash -lc command');
      }
    } else {
      requireIncludes('33-powershell-to-wsl-probe.log', psProbe, 'command=wsl.exe -d');
      requireIncludes('33-powershell-to-wsl-probe.log', psProbe, 'bash -lc weasley-podex --version');
    }
  } else if (!options.allowMissingPowerShellProbe) {
    fail('missing 33-powershell-to-wsl-probe.log for WSL evidence');
  }
}

if (failures.length) {
  console.error('[fresh-evidence-audit] FAIL');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`[fresh-evidence-audit] PASS target=${target} dir=${evidenceDir}`);

