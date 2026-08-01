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
const bashExecutable = process.platform === 'win32'
    ? join(process.env["SystemRoot"] || 'C:\\Windows', 'System32', 'wsl.exe')
    : 'bash';

function bashArgs(script: string): string[] {
    return process.platform === 'win32'
        ? ['-e', '/bin/bash', '-lc', script]
        : ['-lc', script];
}

function toBashPath(hostPath: string): string {
    if (process.platform !== 'win32') return hostPath;
    const uncMatch = /^\\\\wsl(?:\.localhost|\$)\\[^\\]+\\(.*)$/.exec(hostPath);
    if (uncMatch) return `/${uncMatch[1]!.replace(/\\/g, '/')}`;
    const normalized = hostPath.replace(/\\/g, '/');
    const match = /^([A-Za-z]):\/(.*)$/.exec(normalized);
    assert.ok(match, `expected an absolute Windows path: ${hostPath}`);
    return `/mnt/${match[1]!.toLowerCase()}/${match[2]}`;
}

function quoteBash(value: string): string {
    return "'" + value.replace(/'/g, "'\\''") + "'";
}

function writeExecutable(path: string, content: string): void {
    writeFileSync(path, content);
    if (process.platform !== 'win32') {
        chmodSync(path, 0o755);
        return;
    }
    const result = spawnSync(bashExecutable, bashArgs(`chmod 755 ${quoteBash(toBashPath(path))}`), { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || `unable to make fixture executable: ${path}`);
}

function readLinkTarget(path: string): string {
    if (process.platform !== 'win32') return readlinkSync(path);
    const result = spawnSync(bashExecutable, bashArgs(`readlink ${quoteBash(toBashPath(path))}`), { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || `unable to read fixture symlink: ${path}`);
    return result.stdout.trim();
}

function createHarnessHome(): { home: string; bashHome: string } {
    if (process.platform !== 'win32') {
        const home = mkdtempSync(join(tmpdir(), 'weasley-podex-wsl-installer-'));
        return { home, bashHome: home };
    }

    const distroResult = spawnSync(bashExecutable, bashArgs('printenv WSL_DISTRO_NAME'), { encoding: 'utf8' });
    assert.equal(distroResult.status, 0, distroResult.stderr || 'unable to resolve WSL distribution');
    const distro = distroResult.stdout.trim();
    assert.ok(distro, 'WSL_DISTRO_NAME must be available');

    const tempResult = spawnSync(bashExecutable, bashArgs('mktemp -d /tmp/weasley-podex-wsl-installer-XXXXXX'), { encoding: 'utf8' });
    assert.equal(tempResult.status, 0, tempResult.stderr || 'unable to create WSL-native temp directory');
    const bashHome = tempResult.stdout.trim();
    assert.match(bashHome, /^\/tmp\/weasley-podex-wsl-installer-[A-Za-z0-9]+$/);

    const home = join(`\\\\wsl.localhost\\${distro}`, ...bashHome.split('/').filter(Boolean));
    assert.equal(existsSync(home), true, `WSL temp directory is not reachable from Windows: ${home}`);
    return { home, bashHome };
}

function runInstallerSnippet(snippet: string, setup?: (home: string, bin: string) => void): { status: number | null; output: string; home: string } {
    const { home, bashHome } = createHarnessHome();
    const bin = join(home, 'fake-bin');
    mkdirSync(bin, { recursive: true });
    setup?.(home, bin);
    const bashBin = `${bashHome}/fake-bin`;
    const script = `
set -euo pipefail
export HOME=${quoteBash(bashHome)}
export WEASLEY_PODEX_TEST_HOME="$HOME"
export PATH=${quoteBash(`${bashBin}:/usr/bin:/bin:/usr/sbin:/sbin`)}
export WEASLEY_PODEX_SOURCE_ONLY=1
source ${quoteBash(toBashPath(installerPath))}
${snippet}
`;
    const result = spawnSync(bashExecutable, bashArgs(script), {
        encoding: 'utf8',
        env: {
            ...process.env,
            HOME: bashHome,
            PATH: `${bashBin}:/usr/bin:/bin:/usr/sbin:/sbin`,
            WEASLEY_PODEX_SOURCE_ONLY: '1',
        },
    });
    return {
        status: result.status,
        output: `${result.stdout || ''}${result.stderr || ''}`,
        home,
    };
}

function runFreshLoginShell(home: string, command: string): { status: number | null; output: string } {
    const bashHome = toBashPath(home);
    const script = [
        `export HOME=${quoteBash(bashHome)}`,
        'export PATH=/usr/bin:/bin:/usr/sbin:/sbin',
        `exec /bin/bash -lc ${quoteBash(command)}`,
    ].join('\n');
    const result = spawnSync(bashExecutable, bashArgs(script), {
        encoding: 'utf8',
        env: {
            ...process.env,
        },
    });
    return {
        status: result.status,
        output: `${result.stdout || ''}${result.stderr || ''}`,
    };
}

test('WSL installer fails when weasley-podex is present but not runnable', () => {
    const result = runInstallerSnippet('verify_weasley_podex_command', (home) => {
        mkdirSync(join(home, '.local', 'bin'), { recursive: true });
        writeExecutable(join(home, '.local', 'bin', 'weasley-podex'), '#!/usr/bin/env bash\nexit 7\n');
    });
    assert.notEqual(result.status, 0);
    assert.match(result.output, /weasley-podex is on PATH but failed to run/);
    rmSync(result.home, { recursive: true, force: true });
});

test('WSL installer writes login-shell PATH and makes weasley-podex/node/npm durable', () => {
    const result = runInstallerSnippet('configure_npm_prefix\nverify_weasley_podex_command\nprintf "PATH=%s\\n" "$PATH"', (home, bin) => {
        writeExecutable(join(bin, 'node'), '#!/usr/bin/env bash\nif [ "$1" = "--version" ]; then echo "v22.22.3"; exit 0; fi\nexit 0\n');
        writeExecutable(join(bin, 'npm'), '#!/usr/bin/env bash\nif [ "$1" = "--version" ]; then echo "10.9.8"; exit 0; fi\nif [ "$1" = "config" ] && [ "$2" = "get" ]; then echo "$HOME/.local"; exit 0; fi\nexit 0\n');
        mkdirSync(join(home, '.local', 'bin'), { recursive: true });
        writeExecutable(join(home, '.local', 'bin', 'weasley-podex'), '#!/usr/bin/env bash\nif [ "$1" = "--version" ]; then echo "2.0.0"; exit 0; fi\nexit 0\n');
    });
    assert.equal(result.status, 0, result.output);
    assert.match(readFileSync(join(result.home, '.bashrc'), 'utf8'), /\$HOME\/\.local\/bin/);
    assert.match(readFileSync(join(result.home, '.profile'), 'utf8'), /\$HOME\/\.local\/bin/);
    assert.equal(existsSync(join(result.home, '.bash_profile')), false, 'installer should not create .bash_profile and change Bash login precedence');
    assert.equal(readLinkTarget(join(result.home, '.local', 'bin', 'node')).endsWith('/fake-bin/node'), true);
    assert.equal(readLinkTarget(join(result.home, '.local', 'bin', 'npm')).endsWith('/fake-bin/npm'), true);
    const bashHome = toBashPath(result.home);
    assert.match(result.output, new RegExp(`PATH=${bashHome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/\\.local/bin`));
    const login = runFreshLoginShell(result.home, 'command -v node && node --version && command -v npm && npm --version && command -v weasley-podex && weasley-podex --version');
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
            'tr "\\n" ";" < "$WEASLEY_PODEX_TEST_HOME/fnm.log"',
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
