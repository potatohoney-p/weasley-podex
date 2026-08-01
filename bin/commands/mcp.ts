/**
 * weasley-podex mcp — MCP server management
 * MCP server management: list, install, sync, reset.
 *
 * Usage:
 *   weasley-podex mcp                       # list servers
 *   weasley-podex mcp install <pkg>         # install package + add to mcp.json + sync
 *   weasley-podex mcp sync                  # sync mcp.json to all supported CLI configs
 *   weasley-podex mcp reset [--force]       # reset mcp.json to defaults + re-sync
 *
 * Package detection:
 *   npm:  @scope/name or name          → npm i -g <pkg>
 *   pypi: name (with --pypi flag)      → uv tool install <pkg> / pip install <pkg>
 *         or auto-detect by known prefixes (mcp-server-*)
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { WEASLEY_PODEX_HOME } from '../../src/core/config.js';
import { asArray, asRecord, fieldString } from '../_http-client.js';

// ─── lib imports (Single Source of Truth) ────
import {
    loadUnifiedMcp,
    saveUnifiedMcp,
    syncToAll,
    initMcpConfig,
} from '../../lib/mcp-sync.js';

const PATH_LOOKUP_CMD = process.platform === 'win32' ? 'where' : 'which';

// ─── ANSI ────────────────────────────────────
const c = {
    reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
    red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
    cyan: '\x1b[36m',
};

// ─── Helpers ─────────────────────────────────

function execProgram(command: string, args: readonly string[]) {
    return execFileSync(command, args, {
        encoding: 'utf8',
        stdio: 'pipe',
        timeout: 120000,
        windowsHide: true,
    }).trim();
}

function findBinaryPath(name: string): string | null {
    try {
        const out = execFileSync(PATH_LOOKUP_CMD, [name], { encoding: 'utf8', stdio: 'pipe', timeout: 5000 }).trim();
        const first = out.split(/\r?\n/).map(x => x.trim()).find(Boolean);
        return first || null;
    } catch {
        return null;
    }
}



// Known PyPI MCP packages (auto-detect without --pypi flag)
const PYPI_PATTERNS = [
    /^mcp-server-/,       // mcp-server-fetch, mcp-server-git, etc.
    /^mcp-/,
];

function detectEcosystem(pkg: string, forceFlag: string | null) {
    if (forceFlag === 'pypi') return 'pypi';
    if (forceFlag === 'npm') return 'npm';
    // Auto-detect
    if (pkg.startsWith('@')) return 'npm';  // @scope/name → npm
    if (PYPI_PATTERNS.some(p => p.test(pkg))) return 'pypi';
    return 'npm'; // default
}

function installNpm(pkg: string) {
    console.log(`  ${c.yellow}📦 npm i -g ${pkg}${c.reset}`);
    execProgram(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install', '--global', pkg]);
    // Find binary name: last segment of package name
    const binName = pkg.split('/').pop();
    const binPath = findBinaryPath(binName || '') || binName;
    return { command: binName, args: [], bin: binPath };
}

function installPypi(pkg: string) {
    // Prefer uv tool install (faster), fallback to pip
    const hasUv = !!findBinaryPath('uv');
    if (hasUv) {
        console.log(`  ${c.yellow}📦 uv tool install ${pkg}${c.reset}`);
        try {
            execProgram('uv', ['tool', 'install', pkg]);
        } catch {
            // uv tool install might fail if already installed, try upgrade
            try { execProgram('uv', ['tool', 'upgrade', pkg]); } catch { } // best-effort: upgrade may no-op when already current
        }
    } else {
        console.log(`  ${c.yellow}📦 pip install ${pkg}${c.reset}`);
        execProgram(process.platform === 'win32' ? 'pip.exe' : 'pip', ['install', pkg]);
    }
    // Find binary: usually same as package name
    const binName = pkg;
    const binPath = findBinaryPath(binName) || binName;
    return { command: binPath || binName, args: [], bin: binPath };
}

// ─── CLI Routing ─────────────────────────────
const sub = process.argv[3];
const arg = process.argv[4];

switch (sub) {
    case 'install': {
        if (!arg) {
            console.log(`\n  Usage: weasley-podex mcp install <package> [--pypi|--npm]\n`);
            console.log(`  Examples:`);
            console.log(`    weasley-podex mcp install @modelcontextprotocol/server-filesystem`);
            console.log(`    weasley-podex mcp install mcp-server-fetch --pypi`);
            console.log(`    weasley-podex mcp install @upstash/context7-mcp\n`);
            process.exit(1);
        }

        const forceFlag = process.argv.includes('--pypi') ? 'pypi'
            : process.argv.includes('--npm') ? 'npm' : null;
        const eco = detectEcosystem(arg, forceFlag);
        const config = loadUnifiedMcp();
        const serverName = arg.split('/').pop()!.replace(/^@/, '');

        console.log(`\n  ${c.bold}Installing ${arg}${c.reset} (${eco})\n`);

        try {
            const result = eco === 'pypi' ? installPypi(arg) : installNpm(arg);

            // Add to mcp.json
            config.servers[serverName] = {
                command: result.command,
                args: result.args,
            };
            saveUnifiedMcp(config);
            console.log(`  ${c.green}✅ Added to mcp.json:${c.reset} ${serverName}`);

            const syncResults = syncToAll(config);
            const targetCount = Object.keys(syncResults).length;
            console.log(`\n  ${c.green}Done!${c.reset} Server "${serverName}" synced to ${targetCount} CLI targets.\n`);
        } catch (e) {
            console.error(`\n  ${c.red}❌ Install failed: ${(e as Error).message}${c.reset}\n`);
            process.exit(1);
        }
        break;
    }

    case 'sync': {
        const config = loadUnifiedMcp();
        console.log(`\n  ${c.bold}Syncing MCP config → all CLIs${c.reset}\n`);
        const syncResults = syncToAll(config);
        console.log(`  ${c.dim}${Object.keys(syncResults).length} CLI targets processed.${c.reset}`);
        console.log('');
        break;
    }

    case 'reset': {
        const force = process.argv.includes('--force');
        if (!force) {
            const { createInterface } = await import('node:readline');
            const rl = createInterface({ input: process.stdin, output: process.stdout });
            const answer = await new Promise(r => {
                rl.question(
                    `\n  ${c.yellow}⚠️  MCP 설정을 초기화합니다.${c.reset}\n` +
                    `  ${join(WEASLEY_PODEX_HOME, 'mcp.json')}이 재생성되고 지원되는 모든 CLI에 재동기화됩니다.\n` +
                    `  계속하시겠습니까? (y/N): `, r
                );
            });
            rl.close();
            if ((answer as string).toLowerCase() !== 'y') {
                console.log('  취소됨.\n');
                break;
            }
        }

        console.log(`\n  ${c.bold}🔄 MCP 설정 초기화 중...${c.reset}\n`);

        // 1. Delete existing mcp.json
        const mcpPath = join(WEASLEY_PODEX_HOME, 'mcp.json');
        if (existsSync(mcpPath)) {
            unlinkSync(mcpPath);
            console.log(`  ${c.dim}✓ deleted ${mcpPath}${c.reset}`);
        }

        // 2. Re-init (import from workingDir/.mcp.json + DEFAULT_MCP_SERVERS merge)
        let workingDir: string;
        try {
            const settingsPath = join(WEASLEY_PODEX_HOME, 'settings.json');
            workingDir = JSON.parse(readFileSync(settingsPath, 'utf8')).workingDir || WEASLEY_PODEX_HOME;
        } catch { workingDir = WEASLEY_PODEX_HOME; }
        const config = initMcpConfig(workingDir);

        // 3. Re-sync to all CLIs
        const results = syncToAll(config);

        const count = Object.keys(config.servers || {}).length;
        console.log(`\n  ${c.green}✅ 초기화 완료!${c.reset} (${count}개 서버, ${Object.keys(results).length}개 CLI 대상)`);
        for (const [target, ok] of Object.entries(results)) {
            console.log(`  ${ok ? c.green + '✅' : c.dim + '⏭️ '} ${target}${c.reset}`);
        }
        console.log('');
        break;
    }

    case 'list':
    case undefined: {
        const config = loadUnifiedMcp();
        const entries = Object.entries(config.servers || {});
        console.log(`\n  ${c.bold}🔌 MCP Servers${c.reset} (${entries.length})\n`);
        if (!entries.length) {
            console.log(`  ${c.dim}(none)${c.reset}`);
        } else {
            for (const [name, srv] of entries) {
                const s = asRecord(srv);
                const args = asArray<string>(s["args"]);
                const command = fieldString(s["command"]);
                const cmd = args.length
                    ? `${command} ${args.join(' ')}`
                    : command;
                console.log(`  ${c.cyan}•${c.reset} ${c.bold}${name}${c.reset}  ${c.dim}${cmd}${c.reset}`);
            }
        }
        console.log(`\n  ${c.dim}weasley-podex mcp install <pkg>  — 새 MCP 서버 설치${c.reset}`);
        console.log(`  ${c.dim}weasley-podex mcp sync           — 모든 지원 CLI에 동기화${c.reset}`);
        console.log(`  ${c.dim}weasley-podex mcp reset          — 설정 초기화 + 재동기화${c.reset}\n`);
        break;
    }

    default:
        console.error(`  ${c.red}Unknown mcp subcommand: ${sub}${c.reset}`);
        console.log(`  Try: weasley-podex mcp install <pkg>\n`);
        process.exit(1);
}

