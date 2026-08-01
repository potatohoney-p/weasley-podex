import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..', '..');
const installerPath = join(root, 'scripts', 'install-wsl.sh');

function writeExecutable(path: string, content: string): void {
    writeFileSync(path, content);
    chmodSync(path, 0o755);
}

function runInstallerSnippet(snippet: string, setup?: (home: string, bin: string) => void): { status: number | null; output: string; home: string } {
    const home = mkdtempSync(join(tmpdir(), 'jaw-wsl-installer-'));
    const bin = join(home, 'fake-bin');
    mkdirSync(bin, { recursive: true });
    setup?.(home, bin);
    const script = `
set -euo pipefail
export HOME=${JSON.stringify(home)}
export PATH=${JSON.stringify(bin)}:$PATH
export podex_SOURCE_ONLY=1
source ${JSON.stringify(installerPath)}
${snippet}
`;
    const result = spawnSync('bash', ['-lc', script], {
        encoding: 'utf8',
        env: {
            ...process.env,
            HOME: home,
            PATH: `${bin}:${process.env["PATH"] || ''}`,
            podex_SOURCE_ONLY: '1',
        },
    });
    return {
        status: result.status,
        output: `${result.stdout || ''}${result.stderr || ''}`,
        home,
    };
}

function runFreshLoginShell(home: string, command: string): { status: number | null; output: string } {
    const result = spawnSync('bash', ['-lc', command], {
        encoding: 'utf8',
        env: {
            HOME: home,
            PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
        },
    });
    return {
        status: result.status,
        output: `${result.stdout || ''}${result.stderr || ''}`,
    };
}

test('WSL installer fails when jaw is present but not runnable', () => {
    const result = runInstallerSnippet('verify_jaw_command', (home) => {
        mkdirSync(join(home, '.local', 'bin'), { recursive: true });
        writeExecutable(join(home, '.local', 'bin', 'jaw'), '#!/usr/bin/env bash\nexit 7\n');
    });
    assert.notEqual(result.status, 0);
    assert.match(result.output, /jaw is on PATH but failed to run/);
    rmSync(result.home, { recursive: true, force: true });
});

test('WSL installer writes login-shell PATH and makes jaw/node/npm durable', () => {
    const result = runInstallerSnippet('configure_npm_prefix\nverify_jaw_command\nprintf "PATH=%s\\n" "$PATH"', (home, bin) => {
        writeExecutable(join(bin, 'node'), '#!/usr/bin/env bash\nif [ "$1" = "--version" ]; then echo "v22.22.3"; exit 0; fi\nexit 0\n');
        writeExecutable(join(bin, 'npm'), '#!/usr/bin/env bash\nif [ "$1" = "--version" ]; then echo "10.9.8"; exit 0; fi\nif [ "$1" = "config" ] && [ "$2" = "get" ]; then echo "$HOME/.local"; exit 0; fi\nexit 0\n');
        mkdirSync(join(home, '.local', 'bin'), { recursive: true });
        writeExecutable(join(home, '.local', 'bin', 'jaw'), '#!/usr/bin/env bash\nif [ "$1" = "--version" ]; then echo "2.0.0"; exit 0; fi\nexit 0\n');
    });
    assert.equal(result.status, 0, result.output);
    assert.match(readFileSync(join(result.home, '.bashrc'), 'utf8'), /\$HOME\/\.local\/bin/);
    assert.match(readFileSync(join(result.home, '.profile'), 'utf8'), /\$HOME\/\.local\/bin/);
    assert.equal(existsSync(join(result.home, '.bash_profile')), false, 'installer should not create .bash_profile and change Bash login precedence');
    assert.equal(readlinkSync(join(result.home, '.local', 'bin', 'node')).endsWith('/fake-bin/node'), true);
    assert.equal(readlinkSync(join(result.home, '.local', 'bin', 'npm')).endsWith('/fake-bin/npm'), true);
    assert.match(result.output, new RegExp(`PATH=${result.home.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/\\.local/bin`));
    const login = runFreshLoginShell(result.home, 'command -v node && node --version && command -v npm && npm --version && command -v jaw && jaw --version');
    assert.equal(login.status, 0, login.output);
    assert.match(login.output, /v22\.22\.3/);
    assert.match(login.output, /10\.9\.8/);
    assert.match(login.output, /2\.0\.0/);
    rmSync(result.home, { recursive: true, force: true });
});

test('WSL installer updates existing bash login profiles used before .profile', () => {
    const result = runInstallerSnippet('configure_npm_prefix', (home, bin) => {
        writeFileSync(join(home, '.bash_profile'), '# existing bash profile\n');
        writeFileSync(join(home, '.bash_login'), '# existing bash login\n');
        writeExecutable(join(bin, 'node'), '#!/usr/bin/env bash\nif [ "$1" = "--version" ]; then echo "v22.22.3"; exit 0; fi\nexit 0\n');
        writeExecutable(join(bin, 'npm'), '#!/usr/bin/env bash\nif [ "$1" = "--version" ]; then echo "10.9.8"; exit 0; fi\nif [ "$1" = "config" ] && [ "$2" = "get" ]; then echo "$HOME/.local"; exit 0; fi\nexit 0\n');
    });
    assert.equal(result.status, 0, result.output);
    assert.match(readFileSync(join(result.home, '.bash_profile'), 'utf8'), /\$HOME\/\.local\/bin/);
    assert.match(readFileSync(join(result.home, '.bash_login'), 'utf8'), /\$HOME\/\.local\/bin/);
    assert.match(readFileSync(join(result.home, '.profile'), 'utf8'), /\$HOME\/\.local\/bin/);
    const login = runFreshLoginShell(result.home, 'command -v node && node --version && command -v npm && npm --version');
    assert.equal(login.status, 0, login.output);
    assert.match(login.output, /v22\.22\.3/);
    assert.match(login.output, /10\.9\.8/);
    rmSync(result.home, { recursive: true, force: true });
});

test('WSL installer repairs Node >=22 when npm is missing or broken', () => {
    const result = runInstallerSnippet(
        [
            'install_node',
            'printf "fnm-log="',
            'tr "\\n" ";" < "$HOME/fnm.log"',
            'printf "\\n"',
            'npm --version',
        ].join('\n'),
        (_home, bin) => {
            writeExecutable(join(bin, 'node'), '#!/usr/bin/env bash\nif [ "$1" = "-v" ] || [ "$1" = "--version" ]; then echo "v22.22.3"; exit 0; fi\nexit 0\n');
            writeExecutable(join(bin, 'npm'), `#!/usr/bin/env bash
if [ ! -f "$HOME/npm-ready" ]; then
  exit 42
fi
if [ "$1" = "--version" ]; then
  echo "10.9.8"
  exit 0
fi
exit 0
`);
            writeExecutable(join(bin, 'fnm'), `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$HOME/fnm.log"
if [ "$1" = "install" ]; then
  touch "$HOME/npm-ready"
fi
exit 0
`);
        },
    );
    assert.equal(result.status, 0, result.output);
    assert.match(result.output, /npm is not runnable/);
    assert.match(result.output, /fnm detected/);
    assert.match(result.output, /Node\.js v22\.22\.3 with npm 10\.9\.8 ready/);
    assert.match(result.output, /fnm-log=install 22;use 22;default 22;/);
    rmSync(result.home, { recursive: true, force: true });
});

