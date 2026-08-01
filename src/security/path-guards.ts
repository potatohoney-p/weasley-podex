import { getWeasleyPodexEnv } from '../core/weasley-podex-env.js';
// ─── Security: Path Guards ───────────────────────────
// Phase 9.1 — path traversal, id injection, filename abuse 방어
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { resolveHomePath } from '../core/path-expand.js';

const SKILL_ID_RE = /^[a-z0-9][a-z0-9._-]*$/;
const FILE_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

function badRequest(code: string) {
    return Object.assign(new Error(code), { statusCode: 400 });
}

function forbidden(code: string) {
    return Object.assign(new Error(code), { statusCode: 403 });
}

/**
 * Skill ID 검증 — 소문자 영숫자 + 하이픈/점/밑줄만 허용
 * @param {string} id
 * @returns {string} trimmed id
 * @throws 400 invalid_skill_id / path_segment_denied
 */
export function assertSkillId(id: string) {
    const v = String(id || '').trim();
    if (!SKILL_ID_RE.test(v)) throw badRequest('invalid_skill_id');
    if (v.includes('..') || v.includes('/') || v.includes('\\')) throw badRequest('path_segment_denied');
    return v;
}

/**
 * 파일명 검증 — 영숫자 시작, 확장자 제한
 * @param {string} filename
 * @param {object} opts
 * @param {string[]} opts.allowExt - 허용 확장자 배열 (기본: ['.md'])
 * @returns {string} trimmed filename
 * @throws 400 invalid_filename / invalid_extension
 */
export function assertFilename(filename: string, { allowExt = ['.md'] }: { allowExt?: string[] } = {}) {
    const v = String(filename || '').trim();
    if (!v || v.length > 200) throw badRequest('invalid_filename');
    if (!FILE_NAME_RE.test(v)) throw badRequest('invalid_filename');
    if (v.includes('..') || v.includes('/') || v.includes('\\')) throw badRequest('invalid_filename');
    const ext = path.extname(v).toLowerCase();
    if (allowExt.length && !allowExt.includes(ext)) throw badRequest('invalid_extension');
    return v;
}

/**
 * Memory relative path validation — nested relative paths allowed, traversal forbidden
 * @param {string} input
 * @param {object} opts
 * @param {string[]} opts.allowExt
 * @returns {string}
 * @throws 400 invalid_filename / invalid_extension
 */
export function assertMemoryRelPath(input: string, { allowExt = ['.md'] }: { allowExt?: string[] } = {}) {
    const v = String(input || '').trim().replace(/\\/g, '/');
    if (!v || v.length > 300) throw badRequest('invalid_filename');
    if (v.startsWith('/') || v.startsWith('~') || v.includes('..')) throw badRequest('invalid_filename');
    const segments = v.split('/').filter(Boolean);
    if (!segments.length) throw badRequest('invalid_filename');
    for (const seg of segments) {
        if (!FILE_NAME_RE.test(seg)) throw badRequest('invalid_filename');
    }
    const ext = path.extname(v).toLowerCase();
    if (allowExt.length && !allowExt.includes(ext)) throw badRequest('invalid_extension');
    return segments.join('/');
}

/**
 * baseDir 아래로 안전하게 resolve — 탈출 시 403
 * @param {string} baseDir
 * @param {string} unsafeName
 * @returns {string} resolved absolute path
 * @throws 403 path_escape
 */
export function safeResolveUnder(baseDir: string, unsafeName: string) {
    const base = path.resolve(baseDir);
    const resolved = path.resolve(base, unsafeName);
    const pref = base.endsWith(path.sep) ? base : base + path.sep;
    if (resolved !== base && !resolved.startsWith(pref)) throw forbidden('path_escape');
    return resolved;
}

/**
 * Send file path validation — only allow files under WEASLEY_PODEX_HOME or workingDir.
 * Prevents arbitrary file exfiltration via /api/telegram/send, /api/channel/send, etc.
 * @throws 403 path_not_allowed
 */
function safeRealpath(p: string): string | null {
    try { return fs.realpathSync.native(p); }
    catch { return null; }
}

function isUnderRoot(canonical: string, root: string): boolean {
    const pref = root.endsWith(path.sep) ? root : root + path.sep;
    return canonical === root || canonical.startsWith(pref);
}

export function assertSendFilePath(filePath: string, workingDir?: string, projectDirs?: string[] | null): string {
    const resolved = path.resolve(filePath);
    const canonical = safeRealpath(resolved);
    if (!canonical) throw forbidden('path_not_resolvable');

    // Allow anything under the primary Weasley Podex home; legacy variables are fallbacks only.
    const jawHome = resolveHomePath(getWeasleyPodexEnv('HOME') || path.join(os.homedir(), '.weasley', 'podex'));
    const canonJaw = safeRealpath(jawHome);
    if (canonJaw && isUnderRoot(canonical, canonJaw)) return canonical;

    if (workingDir) {
        const canonWd = safeRealpath(path.resolve(workingDir));
        if (canonWd && isUnderRoot(canonical, canonWd)) return canonical;
    }

    if (projectDirs) {
        for (const dir of projectDirs) {
            const currentReal = safeRealpath(path.resolve(dir));
            if (!currentReal || currentReal !== path.resolve(dir)) continue;
            if (isUnderRoot(canonical, currentReal)) return canonical;
        }
    }

    throw forbidden('path_not_allowed');
}

