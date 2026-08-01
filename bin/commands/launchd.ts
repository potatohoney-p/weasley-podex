import { getWeasleyPodexEnv } from '../../src/core/weasley-podex-env.js';
/**
 * weasley-podex launchd — macOS LaunchAgent 관리
 * Usage:
 *   weasley-podex launchd              — plist 확인 → 없으면 생성 → 시작 (원스텝)
 *   weasley-podex launchd --port 3458  — 커스텀 포트로 등록
 *   weasley-podex launchd unset        — plist 제거 + 해제
 *   weasley-podex launchd status       — 현재 상태 확인
 *   weasley-podex launchd cleanup      — legacy plist 정리
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, unlinkSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { parseArgs } from 'node:util';
import { WEASLEY_PODEX_HOME } from '../../src/core/config.js';
import { asRecord, errString } from '../_http-client.js';

if (process.argv[2] === 'launchd' && !getWeasleyPodexEnv('SERVICE_DELEGATE')) {
    console.error('  ⚠️  weasley-podex launchd is deprecated. Use weasley-podex service instead (cross-platform).');
    console.error('');
}
import { instanceId, getNodePath, getJawPath, buildServicePath } from '../../src/core/instance.js';
import { generateLaunchdPlist } from '../../src/core/launchd-plist.js';
import { findLegacyPODEXLabels } from '../../src/core/launchd-cleanup.js';

// parseArgs is safe here — launchd is a leaf command (no subcommands to absorb)
const { values: launchdOpts, positionals: launchdPos } = parseArgs({
    args: process.argv.slice(3),
    options: { port: { type: 'string', default: '3457' } },
    strict: false,
    allowPositionals: true,
});
const PORT = launchdOpts.port as string;

// unknown flag guard (strict:false absorbs unknowns silently)
const knownKeys = new Set(['port']);
for (const key of Object.keys(launchdOpts)) {
    if (!knownKeys.has(key)) {
        console.error(`❌ Unknown option: --${key}`);
        console.error('   Usage: weasley-podex launchd [--port PORT] [status|unset|cleanup]');
        process.exit(1);
    }
}

const INSTANCE = instanceId();
const LABEL = `com.weasley.podex.${INSTANCE}`;
const LEGACY_LABEL = `com.podex.${INSTANCE}`;
const PLIST_PATH = join(homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`);
const LEGACY_PLIST_PATH = join(homedir(), 'Library', 'LaunchAgents', `${LEGACY_LABEL}.plist`);
const LOG_DIR = join(WEASLEY_PODEX_HOME, 'logs');
const USER_ID = typeof process.getuid === 'function' ? process.getuid() : Number(process.env["UID"] || 0);
const GUI_DOMAIN = `gui/${USER_ID}`;


function generatePlist(): string {
    const nodePath = getNodePath();
    const jawPath = getJawPath();
    const servicePath = buildServicePath(process.env["PATH"] || '', [join(homedir(), '.local', 'bin')]);
    execSync(`mkdir -p "${LOG_DIR}"`);

    return generateLaunchdPlist({
        label: LABEL,
        port: PORT,
        nodePath,
        jawPath,
        jawHome: WEASLEY_PODEX_HOME,
        logDir: LOG_DIR,
        servicePath,
    });
}

function scanLegacyLabels(): string[] {
    const dir = join(homedir(), 'Library', 'LaunchAgents');
    if (!existsSync(dir)) return [];
    try {
        return findLegacyPODEXLabels(readdirSync(dir), LABEL);
    } catch {
        return [];
    }
}

function isLoaded(): boolean {
    try {
        execSync(`launchctl print ${GUI_DOMAIN}/${LABEL}`, { stdio: 'pipe' });
        return true;
    } catch { return false; }
}

const sub = launchdPos[0];

switch (sub) {
    case 'unset': {
        const registered = [
            { label: LABEL, path: PLIST_PATH },
            { label: LEGACY_LABEL, path: LEGACY_PLIST_PATH },
        ].filter(item => existsSync(item.path));
        if (registered.length === 0) {
            console.log('⚠️  launchd에 등록되어 있지 않습니다');
            break;
        }
        for (const item of registered) {
            try { execSync(`launchctl bootout ${GUI_DOMAIN}/${item.label}`, { stdio: 'pipe' }); } catch { /* ok */ }
            unlinkSync(item.path);
        }
        console.log('✅ weasley-podex serve 자동 실행 해제 완료');
        break;
    }
    case 'status': {
        const hasCurrent = existsSync(PLIST_PATH);
        const hasLegacy = existsSync(LEGACY_PLIST_PATH);
        if (!hasCurrent && !hasLegacy) {
            console.log('⚠️  weasley-podex serve가 launchd에 등록되어 있지 않습니다');
            console.log('   등록: weasley-podex launchd');
            break;
        }
        const statusLabel = hasCurrent ? LABEL : LEGACY_LABEL;
        const statusPlistPath = hasCurrent ? PLIST_PATH : LEGACY_PLIST_PATH;
        let displayPort = PORT;
        try {
            const plistContent = readFileSync(statusPlistPath, 'utf8');
            const portMatch = plistContent.match(/--port<\/string>\s*<string>(\d+)<\/string>/);
            if (portMatch) displayPort = portMatch[1]!;
        } catch { /* use CLI port as fallback */ }
        try {
            const out = execSync(`launchctl print ${GUI_DOMAIN}/${statusLabel}`, { encoding: 'utf8' });
            const pidMatch = out.match(/pid = (\d+)/);
            const pid = pidMatch ? `running (PID ${pidMatch[1]})` : 'loaded';
            const ptMatch = out.match(/process type\s*=\s*(\w+)/i);
            const processType = ptMatch ? ptMatch[1] : '(unknown)';
            console.log(`◆ weasley-podex serve — ${pid}`);
            console.log(`   instance:    ${INSTANCE}`);
            console.log(`   port:        ${displayPort}`);
            console.log(`   plist:       ${statusPlistPath}`);
            console.log(`   log:         ${LOG_DIR}/${hasCurrent ? 'weasley-podex-serve.log' : 'jaw-serve.log'}`);
            console.log(`   domain:      ${GUI_DOMAIN}`);
            console.log(`   ProcessType: ${processType}`);
            if (!hasCurrent && hasLegacy) {
                console.log('   ⚠️  legacy 서비스 이름입니다. `weasley-podex service`를 실행하면 안전하게 이전됩니다.');
            }
            const legacy = scanLegacyLabels();
            if (legacy.length > 0) {
                console.log(`   ⚠️  legacy plist ${legacy.length}개 — 정리: weasley-podex launchd cleanup`);
            }
        } catch {
            console.log('◆ weasley-podex serve — not loaded');
            console.log(`   plist: ${statusPlistPath} (exists but not loaded)`);
        }
        break;
    }
    case 'cleanup': {
        const legacy = scanLegacyLabels();
        if (legacy.length === 0) {
            console.log('✅ legacy launchd 잔존물 없음');
            break;
        }
        console.log(`🧹 legacy plist ${legacy.length}개 정리:`);
        for (const label of legacy) {
            const legacyPlist = join(homedir(), 'Library', 'LaunchAgents', `${label}.plist`);
            try { execSync(`launchctl bootout ${GUI_DOMAIN}/${label}`, { stdio: 'pipe' }); } catch { /* ok */ }
            try {
                unlinkSync(legacyPlist);
                console.log(`  ✓ removed: ${label}`);
            } catch (e: unknown) {
                console.log(`  ✗ failed: ${label} (${errString(e) || 'unknown'})`);
            }
        }
        break;
    }
    default: {
        // 원스텝: 확인 → 생성 → 시작
        console.log('◆ weasley-podex launchd setup\n');

        // 0. legacy plist 자동 bootout (도메인 오염 방지). 파일 삭제는 cleanup에서.
        const legacy = scanLegacyLabels();
        if (legacy.length > 0) {
            console.log(`🧹 legacy plist ${legacy.length}개 자동 해제 (파일 삭제는 cleanup):`);
            for (const l of legacy) {
                try { execSync(`launchctl bootout ${GUI_DOMAIN}/${l}`, { stdio: 'pipe' }); } catch { /* ok */ }
                try { execSync(`launchctl disable ${GUI_DOMAIN}/${l}`, { stdio: 'pipe' }); } catch { /* ok */ }
                if (l === LEGACY_LABEL && existsSync(LEGACY_PLIST_PATH)) {
                    try { unlinkSync(LEGACY_PLIST_PATH); } catch { /* cleanup command can retry */ }
                }
                console.log(`    - ${l}`);
            }
            console.log('   정리: weasley-podex launchd cleanup\n');
        }

        // 1. plist 생성 (무조건 재생성)
        const plist = generatePlist();
        writeFileSync(PLIST_PATH, plist);
        console.log(`✅ plist 저장: ${PLIST_PATH}`);

        // 2. 기존 등록 완전 해제 (kill → disable → bootout 순)
        try { execSync(`launchctl kill SIGTERM ${GUI_DOMAIN}/${LABEL}`, { stdio: 'pipe' }); } catch { /* ok */ }
        try { execSync(`launchctl disable ${GUI_DOMAIN}/${LABEL}`, { stdio: 'pipe' }); } catch { /* ok */ }
        try {
            execSync(`launchctl bootout ${GUI_DOMAIN}/${LABEL}`, { stdio: 'pipe' });
            console.log('🧹 기존 등록 해제');
        } catch { /* 미등록이면 정상 */ }

        // 2b. label이 완전히 사라질 때까지 대기 (최대 3초)
        for (let i = 0; i < 6; i++) {
            try {
                execSync(`launchctl print ${GUI_DOMAIN}/${LABEL}`, { stdio: 'pipe' });
                try { execSync('sleep 0.5'); } catch { /* ok */ }
            } catch { break; /* 없음 — 진행 */ }
        }
        try { execSync(`launchctl enable ${GUI_DOMAIN}/${LABEL}`, { stdio: 'pipe' }); } catch { /* ok */ }

        // 3. bootstrap + error 5 (I/O error) 복구
        try {
            execSync(`launchctl bootstrap ${GUI_DOMAIN} "${PLIST_PATH}"`, { stdio: 'pipe' });
            console.log('✅ launchd 등록 + 시작 완료\n');
        } catch (e: unknown) {
            const err = asRecord(e);
            const stderr = (asRecord(err["stderr"]).toString?.() || errString(e) || '');
            const isBusy = /Bootstrap failed:\s*5/i.test(stderr)
                || /already (bootstrapped|loaded)/i.test(stderr);
            if (isBusy) {
                console.log('⚠️  Bootstrap error 5 — 2차 강제 복구 시도');
                try { execSync(`launchctl kill SIGKILL ${GUI_DOMAIN}/${LABEL}`, { stdio: 'pipe' }); } catch { /* ok */ }
                try { execSync(`launchctl disable ${GUI_DOMAIN}/${LABEL}`, { stdio: 'pipe' }); } catch { /* ok */ }
                try { execSync(`launchctl bootout ${GUI_DOMAIN}/${LABEL}`, { stdio: 'pipe' }); } catch { /* ok */ }
                try { execSync('sleep 2'); } catch { /* ok */ }
                try { execSync(`launchctl enable ${GUI_DOMAIN}/${LABEL}`, { stdio: 'pipe' }); } catch { /* ok */ }
                try {
                    execSync(`launchctl bootstrap ${GUI_DOMAIN} "${PLIST_PATH}"`, { stdio: 'pipe' });
                    console.log('✅ 재시도 성공\n');
                } catch (e2: unknown) {
                    console.error('');
                    console.error('❌ Bootstrap error 5 지속 — launchd 도메인 오염 가능성');
                    console.error('   수동 복구:');
                    console.error(`     weasley-podex launchd cleanup`);
                    console.error(`     launchctl bootout ${GUI_DOMAIN}/${LABEL} 2>/dev/null`);
                    console.error(`     launchctl disable ${GUI_DOMAIN}/${LABEL} 2>/dev/null`);
                    console.error(`     rm -f "${PLIST_PATH}"`);
                    console.error(`     sleep 3 && weasley-podex launchd`);
                    console.error('   위 조치 후에도 실패하면 재부팅 필요');
                    throw e2;
                }
            } else {
                throw e;
            }
        }

        // 4. 상태 확인
        setTimeout(() => {
            if (isLoaded()) {
                console.log('Weasley Podex serve가 백그라운드에서 실행 중입니다');
                console.log(`   instance: ${INSTANCE}`);
                console.log(`   http://localhost:${PORT}`);
                console.log(`   로그: ${LOG_DIR}/weasley-podex-serve.log`);
                console.log('\n   해제: weasley-podex launchd unset');
            } else {
                console.log('⚠️  시작되지 않았습니다. 로그를 확인하세요:');
                console.log(`   cat ${LOG_DIR}/weasley-podex-serve.err`);
            }
        }, 1000);
        break;
    }
}


