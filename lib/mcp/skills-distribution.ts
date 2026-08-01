/**
 * lib/mcp/skills-distribution.ts
 * Skill distribution: Codex live + bundled core, with an opt-in remote overlay.
 * Auto-activation of CODEX_ACTIVE + OPENCLAW_ACTIVE sets.
 */
import fs from 'fs';
import os from 'os';
import { basename, join } from 'path';
import { execFileSync } from 'child_process';
import {
    WEASLEY_PODEX_HOME,
    shouldSkipClone, writeCloneMeta, CLONE_TIMEOUT_MS,
    CODEX_ACTIVE, OPENCLAW_ACTIVE,
    copyDirRecursive, findPackageRoot,
    loadRegistry, getSkillVersion, shouldUpdateSkillDirectory,
    isDiscoverableSkillDirName, isSkillSourceEntryName,
} from './skills-utils.js';

type SkillRegistry = {
    skills?: Record<string, { category?: string; defaultActive?: boolean }>;
};

const CONFIGURED_SKILLS_REPO_ENV = 'WEASLEY_PODEX_SKILLS_REPO';

/** Return the explicitly configured remote source, if any. */
export function getConfiguredSkillsRepository(
    env: NodeJS.ProcessEnv = process.env,
): string | null {
    const value = env[CONFIGURED_SKILLS_REPO_ENV]?.trim();
    if (!value) return null;
    if (/[\u0000-\u001f\u007f]/.test(value)) {
        throw new Error(`${CONFIGURED_SKILLS_REPO_ENV} contains a control character`);
    }
    return value;
}

export function cloneConfiguredSkillsRepository(repository: string, destination: string): void {
    execFileSync('git', ['clone', '--depth', '1', '--', repository, destination], {
        stdio: 'pipe',
        timeout: CLONE_TIMEOUT_MS,
    });
}

export function assertValidSkillsSourceDirectory(directory: string): void {
    const registryPath = join(directory, 'registry.json');
    let parsed: unknown;
    try {
        parsed = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    } catch {
        throw new Error('configured skills repository has no valid registry.json');
    }
    const skills = (parsed as { skills?: unknown } | null)?.skills;
    if (!skills || typeof skills !== 'object' || Array.isArray(skills) || Object.keys(skills).length === 0) {
        throw new Error('configured skills repository registry has no skills');
    }
}

/**
 * Phase 6 — 2×3 Skill Classification at Install
 *
 * Priority: ~/.codex/skills/ (live Codex) > bundled skills_ref/ (fallback)
 *
 * 1. If Codex is installed, classify its skills into active/ref
 * 2. Copy bundled skills_ref/ (OpenClaw + Codex fallback) → ~/.weasley/podex/skills_ref/
 * 3. Auto-activate: CODEX_ACTIVE + OPENCLAW_ACTIVE from refDir → activeDir
 *    (covers devices where Codex isn't installed)
 */
export function copyDefaultSkills() {
    const activeDir = join(WEASLEY_PODEX_HOME, 'skills');
    const refDir = join(WEASLEY_PODEX_HOME, 'skills_ref');
    fs.mkdirSync(activeDir, { recursive: true });
    fs.mkdirSync(refDir, { recursive: true });

    let copied = 0;

    // Phase 1 dedup: these skills were merged into others — never copy from Codex
    const DEDUP_EXCLUDED = new Set([
        'spreadsheet',         // → xlsx
        'doc',                 // → docx
        'screenshot',          // → screen-capture
        'nano-pdf',            // → pdf
        'gh-issues',           // → github
        'gh-address-comments', // → github
        'gh-fix-ci',           // → github
        'yeet',                // → github
        'playwright',          // → webapp-testing
        'frontend-design',     // → dev-frontend (Orchestration v2)
    ]);

    // ─── 1. Codex live skills (if installed) ────────
    const codexSkills = join(os.homedir(), '.codex', 'skills');
    if (fs.existsSync(codexSkills)) {
        const skills = fs.readdirSync(codexSkills, { withFileTypes: true })
            .filter(d => d.isDirectory()
                && isDiscoverableSkillDirName(d.name)
                && !DEDUP_EXCLUDED.has(d.name));

        let activeCount = 0, refCount = 0;

        for (const skill of skills) {
            const src = join(codexSkills, skill.name);

            if (CODEX_ACTIVE.has(skill.name)) {
                const dst = join(activeDir, skill.name);
                if (!fs.existsSync(dst)) {
                    copyDirRecursive(src, dst);
                    activeCount++;
                }
            } else {
                const dst = join(refDir, skill.name);
                if (!fs.existsSync(dst)) {
                    copyDirRecursive(src, dst);
                    refCount++;
                }
            }
        }
        copied += activeCount + refCount;
        console.log(`[skills] Codex: ${activeCount} active, ${refCount} ref`);
    } else {
        console.log(`[skills] Codex: not installed, using bundled fallback`);
    }

    // ─── 2. Populate skills_ref/ ─────────────────────
    // Default: bundled core. A remote source is consulted only when the
    // canonical WEASLEY_PODEX_SKILLS_REPO variable is explicitly configured.
    const packageRefDir = join(findPackageRoot(), 'skills_ref');
    let skillsSourceResolved = false;
    let configuredRepository: string | null = null;
    try {
        configuredRepository = getConfiguredSkillsRepository();
    } catch (error) {
        console.warn(`[skills] configured repository ignored: ${(error as Error).message}`);
    }

    // 2a. Optional remote source. With no configured repository, no network
    // process is started; a fresh npm install therefore remains offline-safe.
    if (configuredRepository && shouldSkipClone()) {
        console.log('[skills] configured repository clone suppressed (cooldown active)');
    } else if (configuredRepository) {
        const tmpClone = join(WEASLEY_PODEX_HOME, '.skills_clone_tmp');
        try {
            if (fs.existsSync(tmpClone)) fs.rmSync(tmpClone, { recursive: true, force: true });
            console.log('[skills] fetching configured skills repository...');
            cloneConfiguredSkillsRepository(configuredRepository, tmpClone);
            assertValidSkillsSourceDirectory(tmpClone);
            const srcReg = loadRegistry(tmpClone);
            const dstReg = loadRegistry(refDir);
            const cloned = fs.readdirSync(tmpClone, { withFileTypes: true });
            let cloneNew = 0, cloneUpdated = 0;
            for (const entry of cloned) {
                if (!isSkillSourceEntryName(entry.name)) continue;
                const src = join(tmpClone, entry.name);
                const dst = join(refDir, entry.name);
                if (entry.isDirectory()) {
                    if (!fs.existsSync(dst)) {
                        copyDirRecursive(src, dst);
                        cloneNew++;
                    } else if (shouldUpdateSkillDirectory(entry.name, src, dst, srcReg, dstReg)) {
                        const sv = getSkillVersion(entry.name, srcReg);
                        const dv = getSkillVersion(entry.name, dstReg);
                        fs.rmSync(dst, { recursive: true, force: true });
                        copyDirRecursive(src, dst);
                        cloneUpdated++;
                        console.log(`[skills] updated: ${entry.name} ${dv ?? '(same)'} → ${sv ?? '(mtime)'}`);
                    }
                } else if (entry.isFile()) {
                    fs.copyFileSync(src, dst);
                }
            }
            console.log(`[skills] configured repository: ${cloneNew} new, ${cloneUpdated} updated`);
            writeCloneMeta(true);
            skillsSourceResolved = true;
        } catch (error) {
            writeCloneMeta(false);
            console.log(`[skills] configured repository unavailable: ${(error as Error).message?.slice(0, 80)}`);
        } finally {
            if (fs.existsSync(tmpClone)) fs.rmSync(tmpClone, { recursive: true, force: true });
        }
    }

    // 2b. Package-owned core skills are the normal source and the remote
    // failure fallback.
    if (!skillsSourceResolved) {
        const bundledHasContent = fs.existsSync(packageRefDir) && fs.existsSync(join(packageRefDir, 'registry.json'));
        if (bundledHasContent) {
            const srcReg = loadRegistry(packageRefDir);
            const dstReg = loadRegistry(refDir);
            const entries = fs.readdirSync(packageRefDir, { withFileTypes: true });
            let refCopied = 0, refUpdated = 0;
            for (const entry of entries) {
                if (!isSkillSourceEntryName(entry.name)) continue;
                const src = join(packageRefDir, entry.name);
                const dst = join(refDir, entry.name);
                if (entry.isDirectory()) {
                    if (!fs.existsSync(dst)) {
                        copyDirRecursive(src, dst);
                        refCopied++;
                    } else if (shouldUpdateSkillDirectory(entry.name, src, dst, srcReg, dstReg)) {
                        const sv = getSkillVersion(entry.name, srcReg);
                        const dv = getSkillVersion(entry.name, dstReg);
                        fs.rmSync(dst, { recursive: true, force: true });
                        copyDirRecursive(src, dst);
                        refUpdated++;
                        console.log(`[skills] updated: ${entry.name} ${dv ?? '(same)'} → ${sv ?? '(mtime)'}`);
                    }
                } else if (entry.isFile()) {
                    fs.copyFileSync(src, dst);
                }
            }
            console.log(`[skills] bundled core: ${refCopied} new, ${refUpdated} updated`);
            skillsSourceResolved = true;
        }
    }

    if (!skillsSourceResolved) {
        if (fs.existsSync(join(refDir, 'registry.json'))) {
            console.log('[skills] using existing local skills_ref');
            skillsSourceResolved = true;
        } else {
            console.warn('');
            console.warn('[skills] Skills are not available in this package');
            console.warn('');
            console.warn('  Reinstall weasley-podex, then run: weasley-podex skill reset');
            console.warn(`  Optional remote override: set ${CONFIGURED_SKILLS_REPO_ENV}`);
            console.warn('');
        }
    }

    // ─── 3. Auto-activate from refDir ───────────────
    // Promotes CODEX_ACTIVE + OPENCLAW_ACTIVE from ref → active
    // (fallback for devices without ~/.codex/skills/)
    // Orchestration v2: registry에서 category=orchestration인 스킬도 자동 활성화
    try {
        const registryPath = join(refDir, 'registry.json');
        if (fs.existsSync(registryPath)) {
            const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8')) as SkillRegistry;
            for (const [id, meta] of Object.entries(registry.skills || {})) {
                if (meta.defaultActive === true || meta.category === 'orchestration') OPENCLAW_ACTIVE.add(id);
            }
        }
    } catch { /* registry parse error — skip */ }
    const AUTO_ACTIVATE = new Set([...CODEX_ACTIVE, ...OPENCLAW_ACTIVE]);
    let autoCount = 0;
    for (const id of AUTO_ACTIVATE) {
        const src = join(refDir, id);
        const dst = join(activeDir, id);
        if (!fs.existsSync(src)) continue;
        if (!fs.existsSync(dst)) {
            copyDirRecursive(src, dst);
            copied++;
            autoCount++;
            console.log(`[skills] auto-activated: ${id}`);
        } else {
            // Sync active copy if any source file changed, not only SKILL.md.
            if (shouldUpdateSkillDirectory(id, src, dst, { skills: {} }, { skills: {} })) {
                fs.rmSync(dst, { recursive: true, force: true });
                copyDirRecursive(src, dst);
                autoCount++;
                console.log(`[skills] active synced: ${id}`);
            }
        }
    }
    if (autoCount > 0) console.log(`[skills] Total auto-activated/synced: ${autoCount}`);

    return copied;
}

/**
 * Propagate skills from WEASLEY_PODEX_HOME to all Weasley Podex instance directories.
 * Runs after copyDefaultSkills() so the base is already up-to-date.
 *
 * - skills_ref/: version-aware merge (new + updated)
 * - skills/ (active): update existing + auto-activate standard set
 */
export function propagateSkillsToInstances() {
    const home = os.homedir();
    const baseActive = join(WEASLEY_PODEX_HOME, 'skills');
    const baseRef = join(WEASLEY_PODEX_HOME, 'skills_ref');
    if (!fs.existsSync(baseRef)) return;

    let instances: string[];
    try {
        const weasleyRoot = join(home, '.weasley');
        const current = fs.existsSync(weasleyRoot)
            ? fs.readdirSync(weasleyRoot, { withFileTypes: true })
                .filter(d => d.isDirectory() && /^podex-\d+$/.test(d.name))
                .map(d => join(weasleyRoot, d.name))
            : [];
        const legacy = fs.readdirSync(home, { withFileTypes: true })
            .filter(d => d.isDirectory() && /^\.podex-\d+$/.test(d.name))
            .map(d => join(home, d.name));
        instances = [...current, ...legacy];
    } catch { return; }

    if (instances.length === 0) return;

    const srcRefReg = loadRegistry(baseRef);

    // Build auto-activate set (same logic as copyDefaultSkills)
    const autoActivate = new Set([...CODEX_ACTIVE, ...OPENCLAW_ACTIVE]);
    try {
        const registryPath = join(baseRef, 'registry.json');
        if (fs.existsSync(registryPath)) {
            const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8')) as SkillRegistry;
            for (const [id, meta] of Object.entries(registry.skills || {})) {
                if (meta.defaultActive === true || meta.category === 'orchestration') autoActivate.add(id);
            }
        }
    } catch { /* skip */ }

    for (const instDir of instances) {
        const instRef = join(instDir, 'skills_ref');
        const instActive = join(instDir, 'skills');
        fs.mkdirSync(instRef, { recursive: true });
        fs.mkdirSync(instActive, { recursive: true });

        // 1. Sync skills_ref/ (version-aware)
        const dstRefReg = loadRegistry(instRef);
        let refNew = 0, refUpdated = 0;
        for (const entry of fs.readdirSync(baseRef, { withFileTypes: true })) {
            if (!isSkillSourceEntryName(entry.name)) continue;
            const src = join(baseRef, entry.name);
            const dst = join(instRef, entry.name);
            if (entry.isDirectory()) {
                if (!fs.existsSync(dst)) {
                    copyDirRecursive(src, dst);
                    refNew++;
                } else if (shouldUpdateSkillDirectory(entry.name, src, dst, srcRefReg, dstRefReg)) {
                    fs.rmSync(dst, { recursive: true, force: true });
                    copyDirRecursive(src, dst);
                    refUpdated++;
                }
            } else if (entry.isFile()) {
                fs.copyFileSync(src, dst);
            }
        }

        // 2. Sync default active skills from the instance's freshly synced ref.
        // Keep a baseActive fallback for future local-only defaults.
        let activeUpdated = 0, autoActivated = 0;
        for (const id of autoActivate) {
            const refSrc = join(instRef, id);
            const baseSrc = join(baseActive, id);
            const src = fs.existsSync(refSrc) ? refSrc : baseSrc;
            if (!fs.existsSync(src)) continue;

            const dst = join(instActive, id);
            if (!fs.existsSync(dst)) {
                copyDirRecursive(src, dst);
                autoActivated++;
            } else if (shouldUpdateSkillDirectory(id, src, dst, { skills: {} }, { skills: {} })) {
                fs.rmSync(dst, { recursive: true, force: true });
                copyDirRecursive(src, dst);
                activeUpdated++;
            }
        }

        const tag = basename(instDir);
        const parts: string[] = [];
        if (refNew) parts.push(`${refNew} new ref`);
        if (refUpdated) parts.push(`${refUpdated} updated ref`);
        if (activeUpdated) parts.push(`${activeUpdated} active updated`);
        if (autoActivated) parts.push(`${autoActivated} auto-activated`);
        if (parts.length > 0) {
            console.log(`[skills] ${tag}: ${parts.join(', ')}`);
        }
    }

    console.log(`[skills] propagated to ${instances.length} instance(s)`);
}

