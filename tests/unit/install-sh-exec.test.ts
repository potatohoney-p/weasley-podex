import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..', '..');
const installerPath = join(root, 'scripts', 'install.sh');
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

function createHarnessHome(): { home: string; bashHome: string } {
    if (process.platform !== 'win32') {
        const home = mkdtempSync(join(tmpdir(), 'weasley-podex-install-sh-'));
        return { home, bashHome: home };
    }

    const distroResult = spawnSync(bashExecutable, bashArgs('printenv WSL_DISTRO_NAME'), { encoding: 'utf8' });
    assert.equal(distroResult.status, 0, distroResult.stderr || 'unable to resolve WSL distribution');
    const distro = distroResult.stdout.trim();
    assert.ok(distro, 'WSL_DISTRO_NAME must be available');

    const tempResult = spawnSync(bashExecutable, bashArgs('mktemp -d /tmp/weasley-podex-install-sh-XXXXXX'), { encoding: 'utf8' });
    assert.equal(tempResult.status, 0, tempResult.stderr || 'unable to create WSL-native temp directory');
    const bashHome = tempResult.stdout.trim();
    assert.match(bashHome, /^\/tmp\/weasley-podex-install-sh-[A-Za-z0-9]+$/);

    const home = join(`\\\\wsl.localhost\\${distro}`, ...bashHome.split('/').filter(Boolean));
    assert.equal(existsSync(home), true, `WSL temp directory is not reachable from Windows: ${home}`);
    return { home, bashHome };
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

function runInstallerSnippet(
    snippet: string,
    setup?: (home: string, bin: string) => void,
    extraEnv: NodeJS.ProcessEnv = {},
): { status: number | null; output: string; home: string; bin: string } {
    const { home, bashHome } = createHarnessHome();
    const bin = join(home, 'fake-bin');
    mkdirSync(bin, { recursive: true });
    setup?.(home, bin);
    const bashBin = `${bashHome}/fake-bin`;
    const script = `
set -euo pipefail
export HOME=${quoteBash(bashHome)}
export PATH=${quoteBash(`${bashBin}:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`)}
export WEASLEY_PODEX_SOURCE_ONLY=1
source ${quoteBash(toBashPath(installerPath))}
${snippet}
`;
    const result = spawnSync(bashExecutable, bashArgs(script), {
        encoding: 'utf8',
        env: {
            ...process.env,
            ...extraEnv,
            HOME: bashHome,
            PATH: `${bashBin}:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`,
            WEASLEY_PODEX_SOURCE_ONLY: '1',
        },
    });
    return {
        status: result.status,
        output: `${result.stdout || ''}${result.stderr || ''}`,
        home,
        bin,
    };
}

test('macOS installer functions create zsh profiles and persist nvm plus local bin idempotently', () => {
    const result = runInstallerSnippet(
        [
            'export ZDOTDIR="$HOME/.config/zsh"',
            'export SHELL=/bin/zsh',
            'ensure_nvm_shell_profile "$ZDOTDIR/.zshrc"',
            'ensure_nvm_shell_profile "$ZDOTDIR/.zprofile"',
            'ensure_local_bin_path',
            'ensure_local_bin_path',
            'grep -c "export NVM_DIR" "$ZDOTDIR/.zshrc"',
            'grep -c "export NVM_DIR" "$ZDOTDIR/.zprofile"',
            'grep -c "\\.local/bin" "$ZDOTDIR/.zshrc"',
            'grep -c "\\.local/bin" "$ZDOTDIR/.zprofile"',
        ].join('\n'),
    );
    assert.equal(result.status, 0, result.output);
    assert.match(readFileSync(join(result.home, '.config', 'zsh', '.zshrc'), 'utf8'), /NVM_DIR="\$HOME\/\.nvm"/);
    assert.match(readFileSync(join(result.home, '.config', 'zsh', '.zprofile'), 'utf8'), /NVM_DIR="\$HOME\/\.nvm"/);
    assert.match(readFileSync(join(result.home, '.config', 'zsh', '.zshrc'), 'utf8'), /export PATH="\$HOME\/\.local\/bin:\$PATH"/);
    assert.match(readFileSync(join(result.home, '.config', 'zsh', '.zprofile'), 'utf8'), /export PATH="\$HOME\/\.local\/bin:\$PATH"/);
    assert.match(result.output, /^1\n1\n1\n1\n?$/);
    rmSync(result.home, { recursive: true, force: true });
});

test('macOS installer preflights Xcode Command Line Tools before nvm install work', () => {
    const result = runInstallerSnippet('ensure_macos_developer_tools', (_home, bin) => {
        writeExecutable(join(bin, 'uname'), '#!/usr/bin/env bash\necho Darwin\n');
        writeExecutable(join(bin, 'xcode-select'), '#!/usr/bin/env bash\nexit 2\n');
        writeExecutable(join(bin, 'git'), '#!/usr/bin/env bash\necho git version 2.0.0\n');
    });
    assert.notEqual(result.status, 0);
    assert.match(result.output, /xcode-select --install/);
    rmSync(result.home, { recursive: true, force: true });
});

test('macOS installer repairs Node >=22 when npm is missing or broken', () => {
    const result = runInstallerSnippet(
        [
            'ensure_node',
            'printf "brew-log="',
            'tr "\\n" ";" < "$HOME/brew.log"',
            'printf "\\n"',
            'npm --version',
        ].join('\n'),
        (_home, bin) => {
            writeExecutable(join(bin, 'node'), '#!/usr/bin/env bash\nif [ "$1" = "-v" ]; then echo "v22.22.3"; exit 0; fi\nexit 0\n');
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
            writeExecutable(join(bin, 'brew'), `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$HOME/brew.log"
if [ "$1" = "install" ]; then
  touch "$HOME/npm-ready"
fi
exit 0
`);
        },
    );
    assert.equal(result.status, 0, result.output);
    assert.match(result.output, /npm is missing or not runnable/);
    assert.match(result.output, /found without runnable npm — installing/);
    assert.doesNotMatch(result.output, /found but need/);
    assert.match(result.output, /Node\.js v22\.22\.3 with npm 10\.9\.8 installed via Homebrew/);
    assert.match(result.output, /brew-log=install node@22;link --overwrite node@22;/);
    rmSync(result.home, { recursive: true, force: true });
});

test('macOS installer scans PATH for a runnable weasley-podex when an earlier shim is broken', () => {
    const result = runInstallerSnippet('export PATH="$HOME/broken:$HOME/working:$PATH"\nget_installed_weasley_podex_binary', (home) => {
        const broken = join(home, 'broken');
        const working = join(home, 'working');
        mkdirSync(broken, { recursive: true });
        mkdirSync(working, { recursive: true });
        writeExecutable(join(broken, 'weasley-podex'), '#!/usr/bin/env bash\nexit 7\n');
        writeExecutable(join(working, 'weasley-podex'), '#!/usr/bin/env bash\nif [ "$1" = "--version" ]; then echo "weasley-podex 9.9.9"; exit 0; fi\n');
    });
    assert.equal(result.status, 0, result.output);
    assert.match(result.output, /working\/weasley-podex/);
    rmSync(result.home, { recursive: true, force: true });
});

test('macOS one-click installs optional tools best-effort unless strict mode is explicit', () => {
    const result = runInstallerSnippet('install_podex', (_home, bin) => {
        const requireEnvPath = quoteBash(toBashPath(join(bin, 'require-env.txt')));
        const executablePath = quoteBash(toBashPath(join(bin, 'weasley-podex')));
        writeExecutable(join(bin, 'npm'), `#!/usr/bin/env bash
if [ "$1" = "view" ]; then echo "9.9.9"; exit 0; fi
if [ "$1" = "install" ]; then
  printf '%s' "\${WEASLEY_PODEX_REQUIRE_CLI_TOOLS-}" > ${requireEnvPath}
  cat > ${executablePath} <<'EOF'
#!/usr/bin/env bash
if [ "$1" = "--version" ]; then echo "weasley-podex 9.9.9"; exit 0; fi
EOF
  chmod +x ${executablePath}
  exit 0
fi
exit 0
`);
    });
    assert.equal(result.status, 0, result.output);
    assert.equal(readFileSync(join(result.bin, 'require-env.txt'), 'utf8'), '');
    rmSync(result.home, { recursive: true, force: true });
});

