import test from 'node:test';
import assert from 'node:assert/strict';
import {
    ARTIFACT_EXCLUSIONS,
    CODE_ARTIFACT_PATH,
    HUMAN_DOWNLOAD_PREFIX,
    MACHINE_PATH_PREFIX,
    PLAN_FILE_REQUIREMENT,
    PLAN_TOOL_REQUIREMENT,
    TODO_TOOL_REQUIREMENT,
    buildCodeModePrompt,
    checkContractCompliance,
} from '../../src/browser/web-ai/code-mode-prompt.js';

test('web-ai code prompt embeds plan/todo/zip output contract', () => {
    const prompt = buildCodeModePrompt('Node.js Express ping API MVP');

    assert.match(prompt, /Node\.js Express ping API MVP/);
    assert.match(prompt, /\/mnt\/data\/workdir/);
    assert.ok(prompt.includes(PLAN_TOOL_REQUIREMENT));
    assert.ok(prompt.includes(TODO_TOOL_REQUIREMENT));
    assert.ok(prompt.includes(PLAN_FILE_REQUIREMENT));
    assert.match(prompt, /turn_plan\.update_turn_plan/);
    assert.match(prompt, /PLAN\.md 또는 00_plan\.md/);
    assert.match(prompt, /도구가 없으면 절대 사용했다고 말하지 말고/);
    assert.match(prompt, new RegExp(`container\\.exec 로 단 하나의 ${CODE_ARTIFACT_PATH.replace(/\//g, '\\/')}`));
    assert.match(prompt, /find \/mnt\/data -maxdepth 1 -name "\*\.zip" -print/);
    assert.ok(prompt.includes(`${HUMAN_DOWNLOAD_PREFIX} [result.zip](sandbox:${CODE_ARTIFACT_PATH})`));
    assert.ok(prompt.includes(`${MACHINE_PATH_PREFIX} ${CODE_ARTIFACT_PATH}`));
    for (const exclusion of ARTIFACT_EXCLUSIONS) assert.ok(prompt.includes(exclusion), exclusion);
});

test('web-ai code prompt rejects empty requirements', () => {
    assert.throws(() => buildCodeModePrompt('   '), /must not be empty/);
});

test('web-ai multi-zip prompt emits named artifact contract', () => {
    const prompt = buildCodeModePrompt('FastAPI backend + React frontend', { multiZip: true });

    assert.match(prompt, /MULTI-ZIP/);
    assert.match(prompt, /frontend\.zip/);
    assert.match(prompt, /zip마다 정확히 두 줄/);
    assert.match(prompt, /DOWNLOAD: \[<zip basename>\]\(sandbox:\/mnt\/data\/<zip basename>\)/);
    assert.match(prompt, /MACHINE: \/mnt\/data\/<zip basename>/);
    assert.ok(prompt.includes(PLAN_TOOL_REQUIREMENT));
    assert.ok(prompt.includes(TODO_TOOL_REQUIREMENT));
    assert.ok(prompt.includes(PLAN_FILE_REQUIREMENT));
    assert.doesNotMatch(prompt, /단 하나의 \/mnt\/data\/result\.zip/);
});

test('web-ai code contract compliance accepts strict machine-readable outputs', () => {
    assert.equal(checkContractCompliance('/mnt/data/result.zip').compliant, true);
    assert.equal(checkContractCompliance('["/mnt/data/result.zip"]').compliant, true);
    assert.equal(checkContractCompliance([
        'DOWNLOAD: [result.zip](sandbox:/mnt/data/result.zip)',
        'MACHINE: /mnt/data/result.zip',
    ].join('\n')).compliant, true);
    assert.equal(checkContractCompliance([
        'DOWNLOAD: result.zip',
        'MACHINE: /mnt/data/result.zip',
    ].join('\n')).compliant, true);
});

test('web-ai code contract compliance flags chatty answers', () => {
    const chatty = checkContractCompliance('Done! Your zip is at /mnt/data/result.zip.');
    assert.equal(chatty.compliant, false);
    assert.equal(chatty.mentionsPath, true);

    const missing = checkContractCompliance('Here is inline code only.');
    assert.equal(missing.compliant, false);
    assert.equal(missing.mentionsPath, false);
});
