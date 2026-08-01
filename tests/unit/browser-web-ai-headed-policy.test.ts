import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const webAiSkillPath = join(root, 'skills_ref/web-ai/SKILL.md');
const hasWebAiSkill = existsSync(webAiSkillPath);
const privateReferencePaths = [
    join(root, 'devlog/_plan/260429_web_ai_oracle_parity_capability_roadmap/README.md'),
    join(root, 'devlog/_plan/260429_web_ai_oracle_parity_capability_roadmap/06_verification_and_release_gates/README.md'),
];

test('WEB-AI-HEADED-001: live web-ai verification requires headed Chrome', {
    skip: !hasWebAiSkill && 'skills_ref submodule not checked out',
}, () => {
    const skillSrc = readFileSync(webAiSkillPath, 'utf8');
    const sources = [
        skillSrc,
        ...privateReferencePaths
            .filter(path => existsSync(path))
            .map(path => readFileSync(path, 'utf8')),
    ];
    for (const src of sources) {
        assert.match(src, /headed Chrome/i);
        assert.match(src, /headless (?:mode is |is )?(?:forbidden|invalid)/i);
    }
});
