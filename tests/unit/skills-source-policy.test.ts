import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { dirname, join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import {
    isDiscoverableSkillDirName,
    isSkillSourceEntryName,
    shouldUpdateSkillDirectory,
    shouldUseLocalSkillsSource,
} from '../../lib/mcp/skills-utils.js';
import {
    assertValidSkillsSourceDirectory,
    cloneConfiguredSkillsRepository,
    getConfiguredSkillsRepository,
} from '../../lib/mcp/skills-distribution.js';

function withEnv<T>(name: string, value: string | undefined, fn: () => T): T {
    const previous = process.env[name];
    if (value === undefined) {
        delete process.env[name];
    } else {
        process.env[name] = value;
    }
    try {
        return fn();
    } finally {
        if (previous === undefined) {
            delete process.env[name];
        } else {
            process.env[name] = previous;
        }
    }
}

function makeSkillDir(parent: string, name: string, content: string, mtime: Date): string {
    const dir = join(parent, name);
    fs.mkdirSync(dir, { recursive: true });
    const skillMd = join(dir, 'SKILL.md');
    fs.writeFileSync(skillMd, content);
    fs.utimesSync(skillMd, mtime, mtime);
    return dir;
}

test('skills policy excludes backup directories from discovery and source sync', () => {
    assert.equal(isDiscoverableSkillDirName('hwp'), true);
    assert.equal(isDiscoverableSkillDirName('hwp.bak'), false);
    assert.equal(isDiscoverableSkillDirName('pptx_original'), false);
    assert.equal(isDiscoverableSkillDirName('.shadow'), false);

    assert.equal(isSkillSourceEntryName('hwp'), true);
    assert.equal(isSkillSourceEntryName('hwp.bak'), false);
    assert.equal(isSkillSourceEntryName('xlsx_original'), false);
    assert.equal(isSkillSourceEntryName('.git'), false);
});

test('skills policy supports local bundled source opt-in during postinstall/reset', () => {
    assert.equal(withEnv('WEASLEY_PODEX_SKILLS_SOURCE', undefined, shouldUseLocalSkillsSource), false);
    assert.equal(withEnv('WEASLEY_PODEX_SKILLS_SOURCE', 'local', shouldUseLocalSkillsSource), true);
    assert.equal(withEnv('WEASLEY_PODEX_SKILLS_SOURCE', 'bundled', shouldUseLocalSkillsSource), true);
    assert.equal(withEnv('WEASLEY_PODEX_SKILLS_SOURCE', 'package', shouldUseLocalSkillsSource), true);
    assert.equal(withEnv('WEASLEY_PODEX_SKILLS_SOURCE', 'remote', shouldUseLocalSkillsSource), false);
});

test('skills policy only enables a remote source through the canonical explicit variable', () => {
    assert.equal(getConfiguredSkillsRepository({}), null);
    assert.equal(getConfiguredSkillsRepository({ WEASLEY_PODEX_SKILLS_REPO: '  https://example.test/skills.git  ' }),
        'https://example.test/skills.git');
    assert.equal(getConfiguredSkillsRepository({ JAW_SKILLS_REPO: 'https://legacy.invalid/skills.git' }), null);
    assert.throws(
        () => getConfiguredSkillsRepository({ WEASLEY_PODEX_SKILLS_REPO: 'https://example.test/repo\nnext' }),
        /control character/,
    );
});

test('skills distribution uses shell-free git arguments and contains no retired repository URL', () => {
    const source = fs.readFileSync(join(import.meta.dirname, '../../lib/mcp/skills-distribution.ts'), 'utf8');
    const reset = fs.readFileSync(join(import.meta.dirname, '../../lib/mcp/skills-reset.ts'), 'utf8');
    const doctor = fs.readFileSync(join(import.meta.dirname, '../../bin/commands/doctor.ts'), 'utf8');

    assert.match(source, /execFileSync\('git', \['clone', '--depth', '1', '--', repository, destination\]/);
    for (const value of [source, reset, doctor]) {
        assert.doesNotMatch(value, /potatohoney-p\/podex-skills/);
        assert.doesNotMatch(value, /execSync\(`git clone/);
    }
});

test('configured repository clone treats metacharacters in local paths as data', () => {
    const root = fs.mkdtempSync(join(os.tmpdir(), 'weasley-skills-clone-'));
    try {
        const source = join(root, 'source ; safe repo');
        const destination = join(root, 'clone ; safe destination');
        fs.mkdirSync(join(source, 'sample'), { recursive: true });
        fs.writeFileSync(join(source, 'sample', 'SKILL.md'), '# sample\n');
        fs.writeFileSync(join(source, 'registry.json'), '{"skills":{"sample":{"version":"1.0.0"}}}\n');
        execFileSync('git', ['init', '--initial-branch=main', source], { stdio: 'ignore' });
        execFileSync('git', ['-C', source, 'add', '.'], { stdio: 'ignore' });
        execFileSync('git', [
            '-C', source,
            '-c', 'user.name=Weasley Test',
            '-c', 'user.email=weasley-test@example.invalid',
            'commit', '-m', 'fixture',
        ], { stdio: 'ignore' });

        cloneConfiguredSkillsRepository(source, destination);
        assert.equal(fs.existsSync(join(destination, 'sample', 'SKILL.md')), true);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('configured repository requires a non-empty registry before it can replace the bundle', () => {
    const root = fs.mkdtempSync(join(os.tmpdir(), 'weasley-skills-registry-'));
    try {
        assert.throws(() => assertValidSkillsSourceDirectory(root), /valid registry\.json/);
        fs.writeFileSync(join(root, 'registry.json'), '{"skills":{}}\n');
        assert.throws(() => assertValidSkillsSourceDirectory(root), /registry has no skills/);
        fs.writeFileSync(join(root, 'registry.json'), '{"skills":{"sample":{"version":"1.0.0"}}}\n');
        assert.doesNotThrow(() => assertValidSkillsSourceDirectory(root));
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('bundled core catalog is complete and can activate with no git executable', () => {
    const root = fs.mkdtempSync(join(os.tmpdir(), 'weasley-bundled-skills-'));
    try {
        const code = `
            const { copyDefaultSkills } = await import('./lib/mcp/skills-distribution.ts');
            copyDefaultSkills();
        `;
        execFileSync(process.execPath, ['--import', 'tsx', '--eval', code], {
            cwd: join(import.meta.dirname, '../..'),
            env: {
                ...process.env,
                USERPROFILE: root,
                PATH: '',
                WEASLEY_PODEX_HOME: join(root, '.weasley', 'podex'),
                WEASLEY_PODEX_SKILLS_REPO: '',
            },
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        const expected = ['browser', 'dev', 'dev-pabcd', 'diagram', 'goal', 'memory', 'search', 'web-ai'];
        const installedRoot = join(root, '.weasley', 'podex');
        const bundledRegistry = JSON.parse(fs.readFileSync(join(import.meta.dirname, '../../skills_ref/registry.json'), 'utf8'));
        assert.deepEqual(Object.keys(bundledRegistry.skills).sort(), expected);
        for (const id of expected) {
            assert.equal(fs.existsSync(join(installedRoot, 'skills_ref', id, 'SKILL.md')), true, `${id} ref missing`);
            assert.equal(fs.existsSync(join(installedRoot, 'skills', id, 'SKILL.md')), true, `${id} active missing`);
        }
        assert.equal(fs.existsSync(join(installedRoot, 'skills_ref', 'dev-pabcd', 'references', 'catalog-discovery.yaml')), true);
        assert.equal(fs.existsSync(join(installedRoot, 'skills_ref', 'web-ai', 'modules', 'gpt-dev-agent-context.md')), true);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('soft reset bootstraps a missing home entirely from the bundled catalog', () => {
    const root = fs.mkdtempSync(join(os.tmpdir(), 'weasley-soft-reset-skills-'));
    try {
        const code = `
            const { softResetSkills } = await import('./lib/mcp/skills-reset.ts');
            softResetSkills();
        `;
        execFileSync(process.execPath, ['--import', 'tsx', '--eval', code], {
            cwd: join(import.meta.dirname, '../..'),
            env: {
                ...process.env,
                USERPROFILE: root,
                PATH: '',
                WEASLEY_PODEX_HOME: join(root, '.weasley', 'podex'),
                WEASLEY_PODEX_SKILLS_REPO: '',
            },
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        for (const id of ['browser', 'dev', 'dev-pabcd', 'diagram', 'goal', 'memory', 'search', 'web-ai']) {
            assert.equal(fs.existsSync(join(root, '.weasley', 'podex', 'skills', id, 'SKILL.md')), true, `${id} active missing`);
        }
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('doctor reports bundled skills healthy after an offline soft reset', () => {
    const root = fs.mkdtempSync(join(os.tmpdir(), 'weasley-doctor-skills-'));
    const env = {
        ...process.env,
        USERPROFILE: root,
        PATH: dirname(process.execPath),
        WEASLEY_PODEX_HOME: join(root, '.weasley', 'podex'),
        WEASLEY_PODEX_SKILLS_REPO: '',
    };
    try {
        execFileSync(process.execPath, [
            '--import', 'tsx', '--eval',
            `const { softResetSkills } = await import('./lib/mcp/skills-reset.ts'); softResetSkills();`,
        ], {
            cwd: join(import.meta.dirname, '../..'),
            env,
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        const result = spawnSync(process.execPath, [
            '--import', 'tsx', 'bin/commands/doctor.ts', 'doctor', '--json',
        ], {
            cwd: join(import.meta.dirname, '../..'),
            env,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        const report = JSON.parse(result.stdout) as {
            checks: Array<{ name: string; status: string; detail: string }>;
        };
        const skills = report.checks.find(check => check.name === 'Skills directory');
        assert.equal(skills?.status, 'ok', skills?.detail || result.stderr);
        assert.match(skills?.detail || '', /8 active/);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('skills policy updates same-version skills when source SKILL.md is newer', () => {
    const root = fs.mkdtempSync(join(os.tmpdir(), 'jaw-skills-policy-'));
    try {
        const srcRoot = join(root, 'src');
        const dstRoot = join(root, 'dst');
        const oldTime = new Date('2026-01-01T00:00:00Z');
        const newTime = new Date('2026-01-02T00:00:00Z');
        makeSkillDir(srcRoot, 'hwp', 'source', newTime);
        makeSkillDir(dstRoot, 'hwp', 'dest', oldTime);

        assert.equal(
            shouldUpdateSkillDirectory('hwp', join(srcRoot, 'hwp'), join(dstRoot, 'hwp'), { skills: {} }, { skills: {} }),
            true,
        );
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('skills policy updates same-version skills when only a nested script is newer', () => {
    const root = fs.mkdtempSync(join(os.tmpdir(), 'jaw-skills-policy-'));
    try {
        const srcRoot = join(root, 'src');
        const dstRoot = join(root, 'dst');
        const oldTime = new Date('2026-01-01T00:00:00Z');
        const newTime = new Date('2026-01-02T00:00:00Z');
        const src = makeSkillDir(srcRoot, 'pptx', 'source skill', oldTime);
        const dst = makeSkillDir(dstRoot, 'pptx', 'dest skill', newTime);

        fs.mkdirSync(join(src, 'scripts'), { recursive: true });
        fs.writeFileSync(join(src, 'scripts', 'thumbnail.py'), 'source script');
        fs.utimesSync(join(src, 'scripts', 'thumbnail.py'), newTime, newTime);

        fs.mkdirSync(join(dst, 'scripts'), { recursive: true });
        fs.writeFileSync(join(dst, 'scripts', 'thumbnail.py'), 'dest script');
        fs.utimesSync(join(dst, 'scripts', 'thumbnail.py'), oldTime, oldTime);

        assert.equal(
            shouldUpdateSkillDirectory('pptx', src, dst, { skills: {} }, { skills: {} }),
            true,
        );
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('skills policy prefers semver promotion over timestamp state', () => {
    const root = fs.mkdtempSync(join(os.tmpdir(), 'jaw-skills-policy-'));
    try {
        const srcRoot = join(root, 'src');
        const dstRoot = join(root, 'dst');
        const oldTime = new Date('2026-01-01T00:00:00Z');
        const newTime = new Date('2026-01-02T00:00:00Z');
        makeSkillDir(srcRoot, 'hwp', 'source', oldTime);
        makeSkillDir(dstRoot, 'hwp', 'dest', newTime);

        assert.equal(
            shouldUpdateSkillDirectory(
                'hwp',
                join(srcRoot, 'hwp'),
                join(dstRoot, 'hwp'),
                { skills: { hwp: { version: '1.2.0' } } },
                { skills: { hwp: { version: '1.1.9' } } },
            ),
            true,
        );
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
