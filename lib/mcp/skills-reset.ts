/**
 * lib/mcp/skills-reset.ts
 * Soft/hard reset and recovery for skills.
 */
import fs from 'fs';
import { join, resolve } from 'path';
import {
    WEASLEY_PODEX_HOME,
    shouldSkipClone, writeCloneMeta,
    CODEX_ACTIVE, OPENCLAW_ACTIVE,
    copyDirRecursive, findPackageRoot,
    isDiscoverableSkillDirName, isSkillSourceEntryName,
} from './skills-utils.js';

type SkillRegistry = {
    skills?: Record<string, { category?: string; defaultActive?: boolean }>;
};
import {
    ensureWorkingDirSkillsLinks,
    createBackupContext,
    movePathToBackup,
} from './skills-symlinks.js';
import {
    assertValidSkillsSourceDirectory,
    cloneConfiguredSkillsRepository,
    copyDefaultSkills,
    getConfiguredSkillsRepository,
} from './skills-distribution.js';
import { stripUndefined } from '../../src/core/strip-undefined.js';

// ─── Types ─────────────────────────────────────────

export type SkillResetMode = 'soft' | 'hard';

type SkillResetCoreResult = {
    restored: number;
    added: number;
    copied?: number;
};

export type SkillResetResult = SkillResetCoreResult & {
    mode: SkillResetMode;
    symlinks?: ReturnType<typeof ensureWorkingDirSkillsLinks>;
    repairedPaths?: string[];
};

// ─── Soft reset ────────────────────────────────────

/**
 * Soft reset: registry에 등록된 스킬만 번들 초기값으로 복원.
 * 미등록(커스텀) 스킬은 보존.
 */
export function softResetSkills() {
    const activeDir = join(WEASLEY_PODEX_HOME, 'skills');
    const refDir = join(WEASLEY_PODEX_HOME, 'skills_ref');
    const packageRefDir = join(findPackageRoot(), 'skills_ref');
    fs.mkdirSync(activeDir, { recursive: true });
    fs.mkdirSync(refDir, { recursive: true });

    // 1. Source for ref update: explicitly configured repository → bundled core.
    // With no WEASLEY_PODEX_SKILLS_REPO, reset performs no network operation.
    let sourceDir: string | null = null;
    let tmpCloneDir: string | null = null;

    let configuredRepository: string | null = null;
    try {
        configuredRepository = getConfiguredSkillsRepository();
    } catch (error) {
        console.warn(`[skills:soft-reset] configured repository ignored: ${(error as Error).message}`);
    }

    // 1a. A remote clone is opt-in and always uses execFileSync argument
    // boundaries through cloneConfiguredSkillsRepository().
    if (configuredRepository && shouldSkipClone()) {
        console.log('[skills:soft-reset] configured repository clone suppressed (cooldown active)');
    } else if (configuredRepository) {
        try {
            tmpCloneDir = join(WEASLEY_PODEX_HOME, '.skills_clone_tmp');
            if (fs.existsSync(tmpCloneDir)) fs.rmSync(tmpCloneDir, { recursive: true, force: true });
            console.log('[skills:soft-reset] fetching configured skills repository...');
            cloneConfiguredSkillsRepository(configuredRepository, tmpCloneDir);
            assertValidSkillsSourceDirectory(tmpCloneDir);
            writeCloneMeta(true);
            sourceDir = tmpCloneDir;
        } catch (error) {
            writeCloneMeta(false);
            console.log(`[skills:soft-reset] configured repository unavailable: ${(error as Error).message?.slice(0, 80)}`);
            if (tmpCloneDir && fs.existsSync(tmpCloneDir)) {
                fs.rmSync(tmpCloneDir, { recursive: true, force: true });
            }
            tmpCloneDir = null;
        }
    }

    // 1b. Normal source and remote failure fallback: bundled skills_ref/.
    if (!sourceDir) {
        const bundledReady = fs.existsSync(packageRefDir) && fs.existsSync(join(packageRefDir, 'registry.json'));
        if (bundledReady) {
            sourceDir = packageRefDir;
            console.log('[skills:soft-reset] using bundled core');
        } else if (fs.existsSync(join(refDir, 'registry.json'))) {
            // 1c. Keep an existing local catalog if a damaged package has no bundle.
            sourceDir = null;
            console.log('[skills:soft-reset] using existing local skills_ref');
        } else {
            console.warn('[skills:soft-reset] no source available — keeping current skills unchanged');
            return { restored: 0, added: 0 };
        }
    }

    // 2. skills_ref/ 전체를 소스에서 다시 복사 (덮어쓰기)
    // sourceDir === null means existing skills_ref/ is already populated (manual clone) — skip copy
    if (sourceDir) {
        for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
            if (!isSkillSourceEntryName(entry.name)) continue;
            const src = join(sourceDir, entry.name);
            const dst = join(refDir, entry.name);
            if (entry.isDirectory()) {
                if (fs.existsSync(dst)) fs.rmSync(dst, { recursive: true, force: true });
                copyDirRecursive(src, dst);
            } else if (entry.isFile()) {
                fs.copyFileSync(src, dst);
            }
        }
    }

    // Cleanup temp clone
    if (tmpCloneDir && fs.existsSync(tmpCloneDir)) {
        fs.rmSync(tmpCloneDir, { recursive: true, force: true });
    }

    // 3. Build autoActivate set before touching active dir
    const autoActivate = new Set([...CODEX_ACTIVE, ...OPENCLAW_ACTIVE]);
    try {
        const regPath = join(refDir, 'registry.json');
        if (fs.existsSync(regPath)) {
            const reg = JSON.parse(fs.readFileSync(regPath, 'utf8')) as SkillRegistry;
            for (const [id, meta] of Object.entries(reg.skills || {})) {
                if (meta.defaultActive === true || meta.category === 'orchestration') autoActivate.add(id);
            }
        }
    } catch { /* registry parse error — skip */ }

    // 4. active skills: update from ref, remove non-active (keep pure custom)
    let restored = 0;
    let removed = 0;
    if (fs.existsSync(activeDir)) {
        for (const d of fs.readdirSync(activeDir, { withFileTypes: true })) {
            if (!d.isDirectory() || !isDiscoverableSkillDirName(d.name)) continue;
            const src = join(refDir, d.name);
            const dst = join(activeDir, d.name);
            if (!fs.existsSync(src)) continue;  // ref에 없으면 보존 (순수 커스텀)
            if (!autoActivate.has(d.name)) {
                fs.rmSync(dst, { recursive: true, force: true });
                removed++;
                continue;
            }
            fs.rmSync(dst, { recursive: true, force: true });
            copyDirRecursive(src, dst);
            restored++;
        }
    }

    // 5. AUTO_ACTIVATE 중 아직 active에 없는 것 추가
    let added = 0;
    for (const id of autoActivate) {
        const src = join(refDir, id);
        const dst = join(activeDir, id);
        if (!fs.existsSync(src) || fs.existsSync(dst)) continue;
        copyDirRecursive(src, dst);
        added++;
    }

    // 6. Cleanup temp clone
    if (tmpCloneDir && fs.existsSync(tmpCloneDir)) {
        fs.rmSync(tmpCloneDir, { recursive: true, force: true });
    }

    console.log(`[skills:soft-reset] restored=${restored}, added=${added}, removed=${removed}`);
    return { restored, added };
}

// ─── Hard reset ────────────────────────────────────

function runHardSkillResetCore(): SkillResetCoreResult {
    const activeDir = join(WEASLEY_PODEX_HOME, 'skills');
    const refDir = join(WEASLEY_PODEX_HOME, 'skills_ref');
    if (fs.existsSync(activeDir)) fs.rmSync(activeDir, { recursive: true, force: true });
    if (fs.existsSync(refDir)) fs.rmSync(refDir, { recursive: true, force: true });
    fs.mkdirSync(activeDir, { recursive: true });
    fs.mkdirSync(refDir, { recursive: true });
    const copied = copyDefaultSkills();
    return { restored: 0, added: copied, copied };
}

// ─── Repair helpers ────────────────────────────────

function isTrustedRepairTarget(repairTargetDir: string, jawHome = WEASLEY_PODEX_HOME): boolean {
    return resolve(repairTargetDir) === resolve(jawHome);
}

function looksLikePODEXLegacySkillsDir(targetPath: string): boolean {
    if (!fs.existsSync(targetPath)) return false;
    try {
        const stat = fs.lstatSync(targetPath);
        if (stat.isSymbolicLink() || !stat.isDirectory()) return false;
        const entries = fs.readdirSync(targetPath, { withFileTypes: true });
        return entries.some(entry =>
            entry.isDirectory() && fs.existsSync(join(targetPath, entry.name, 'SKILL.md')));
    } catch {
        return false;
    }
}

function repairLegacyManagedSkillDirs(
    repairTargetDir: string,
    opts: { includeClaude?: boolean; _jawHome?: string } = {},
): string[] {
    const targets = [
        join(repairTargetDir, '.agents', 'skills'),
        ...(opts.includeClaude ? [join(repairTargetDir, '.claude', 'skills')] : []),
    ];
    const repairedPaths: string[] = [];
    const backupContext = createBackupContext(opts._jawHome);

    for (const targetPath of targets) {
        if (!looksLikePODEXLegacySkillsDir(targetPath)) continue;
        movePathToBackup(targetPath, backupContext);
        repairedPaths.push(targetPath);
    }

    return repairedPaths;
}

export function repairManagedSkillLinksAfterReset(
    repairTargetDir: string,
    opts: {
        includeClaude?: boolean;
        _homedir?: string;
        _jawHome?: string;
    } = {},
): { symlinks?: ReturnType<typeof ensureWorkingDirSkillsLinks>; repairedPaths: string[] } {
    const jawHome = opts._jawHome ?? WEASLEY_PODEX_HOME;
    if (!isTrustedRepairTarget(repairTargetDir, jawHome)) {
        return { repairedPaths: [] };
    }

    const repairedPaths = repairLegacyManagedSkillDirs(repairTargetDir, {
        includeClaude: opts.includeClaude ?? true,
        _jawHome: jawHome,
    });

    const symlinks = ensureWorkingDirSkillsLinks(repairTargetDir, stripUndefined({
        onConflict: 'skip',
        includeClaude: opts.includeClaude ?? true,
        allowReplaceManaged: true,
        _homedir: opts._homedir,
        _jawHome: jawHome,
    }));

    return { symlinks, repairedPaths };
}

// ─── Main entry ────────────────────────────────────

export function runSkillReset(options: {
    mode: SkillResetMode;
    repairTargetDir?: string | null;
    includeClaude?: boolean;
    _homedir?: string;
    _jawHome?: string;
}): SkillResetResult {
    const mode = options.mode;
    const resetResult: SkillResetCoreResult = mode === 'hard'
        ? runHardSkillResetCore()
        : softResetSkills();

    if (!options.repairTargetDir) {
        return { mode, ...resetResult };
    }

    const repair = repairManagedSkillLinksAfterReset(options.repairTargetDir, stripUndefined({
        includeClaude: options.includeClaude ?? true,
        _homedir: options._homedir,
        _jawHome: options._jawHome,
    }));

    return { mode, ...resetResult, ...repair };
}


