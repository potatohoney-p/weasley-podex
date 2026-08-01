import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand, executeCommand } from '../../src/cli/commands.ts';
import {
    buildReviewArtifact,
    buildReviewSteerPrompt,
    buildReviewTargetContext,
    parseReviewFocus,
    parseReviewFlags,
} from '../../src/workflows/review.ts';

const repoRoot = '/Users/weasley/Developer/weasley-podex';
const weasleyPodexHome = '/Users/weasley/.weasley/podex';

function sectionBody(artifact: ReturnType<typeof buildReviewArtifact>, id: string): string {
    const section = artifact.sections.find(s => s.id === id);
    assert.ok(section, `missing artifact section: ${id}`);
    return section.body;
}

test('/review artifact prefers projectDirs over workingDir', () => {
    const artifact = buildReviewArtifact(parseReviewFlags([]), 'en', {
        workingDir: weasleyPodexHome,
        projectDirs: [repoRoot],
    });

    assert.equal(sectionBody(artifact, 'review-target'), repoRoot);
    assert.equal(sectionBody(artifact, 'configured-project-dirs'), repoRoot);
    assert.match(sectionBody(artifact, 'markdown-report'), /review-reports[\\/]weasley-podex-/);
    assert.equal(artifact.storage.projectKey.startsWith('weasley-podex-'), true);
});

test('/review artifact does not turn WEASLEY_PODEX_HOME or process cwd into a project target', () => {
    const artifact = buildReviewArtifact(parseReviewFlags([]), 'en', {
        workingDir: weasleyPodexHome,
        projectDirs: null,
    });

    assert.equal(sectionBody(artifact, 'review-target'), 'Infer from recent context, then validate git repo');
    assert.equal(sectionBody(artifact, 'configured-project-dirs'), '(none configured)');
    assert.match(sectionBody(artifact, 'target-policy'), /No projectDirs are configured/);
    assert.doesNotMatch(sectionBody(artifact, 'review-target'), /\.podex/);
    assert.doesNotMatch(sectionBody(artifact, 'review-target'), new RegExp(process.cwd().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('/review steer prompt contains project-dir validation and markdown report contract', () => {
    const context = buildReviewTargetContext({
        workingDir: weasleyPodexHome,
        projectDirs: null,
    }, '20260608110000-reviewReport-test');
    const prompt = buildReviewSteerPrompt(parseReviewFlags([]), context);

    assert.match(prompt, /Never use WEASLEY_PODEX_HOME, ~\/\.weasley\/podex\*, legacy ~\/\.podex\*, settings\.workingDir, or process\.cwd\(\) as a fallback review target/);
    assert.match(prompt, /infer the most likely repository from recent conversation\/context/i);
    assert.match(prompt, /git rev-parse --show-toplevel/);
    assert.match(prompt, /Save the final human-readable report as Markdown at the exact Markdown report path/);
    assert.match(prompt, new RegExp(context.reportPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.doesNotMatch(prompt, new RegExp(`Project root: ${weasleyPodexHome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
});

test('/review steer prompt resolves recent-context scope beyond uncommitted diff', () => {
    const context = buildReviewTargetContext({
        workingDir: weasleyPodexHome,
        projectDirs: [repoRoot],
    }, '20260609000000-reviewReport-scope');
    const prompt = buildReviewSteerPrompt(parseReviewFlags([]), context);

    assert.doesNotMatch(prompt, /code review of uncommitted changes/,
        'review must not be framed as uncommitted-only');
    assert.match(prompt, /recent relevant project changes/,
        'review should be framed around recent project changes');
    assert.match(prompt, /current conversation focus first/);
    assert.match(prompt, /weasley-podex goal status/);
    assert.match(prompt, /weasley-podex goal history/);
    assert.match(prompt, /weasley-podex chat search .*--recent N/);
    assert.match(prompt, /--days N/);
    assert.match(prompt, /git log --oneline --decorate --max-count=20/);
    assert.match(prompt, /git reflog --date=iso --max-count=20/);
    assert.match(prompt, /do not include unrelated commits merely because they are in `origin\/master\.\.HEAD`/,
        'git ranges should be evidence, not a reason to broaden past the conversation focus');
    assert.match(prompt, /committed changes, uncommitted changes, and untracked files/,
        'uncommitted changes remain one input, not the whole review scope');
    assert.match(prompt, /Do not limit the review to `git diff HEAD`/);
    assert.match(prompt, /No project changes to review/);
    assert.doesNotMatch(prompt, /No uncommitted changes to review/);
    assert.match(prompt, /Scope Resolution/);
});

test('/review preserves user-provided focus text as the highest-priority scope signal', async () => {
    const args = ['프롬프트', 'scope', '--fix'];
    const flags = parseReviewFlags(args);
    const focus = parseReviewFocus(args);
    const artifact = buildReviewArtifact(flags, 'en', {
        workingDir: weasleyPodexHome,
        projectDirs: [repoRoot],
    }, focus);
    const context = buildReviewTargetContext({ projectDirs: [repoRoot] }, '20260609000000-reviewReport-focus');
    const prompt = buildReviewSteerPrompt(flags, context, focus);

    assert.equal(focus, '프롬프트 scope');
    assert.equal(sectionBody(artifact, 'review-focus'), '프롬프트 scope');
    assert.equal(artifact.sourcePrompt, '/review 프롬프트 scope --fix');
    assert.match(prompt, /User-requested review focus: 프롬프트 scope/);
    assert.match(prompt, /highest-priority scope signal/);

    const parsed = parseCommand('/review 프롬프트 scope --fix');
    const result = await executeCommand(parsed, {
        interface: 'telegram',
        locale: 'en',
        getSettings: () => ({ workingDir: weasleyPodexHome, projectDirs: [repoRoot] }),
    });

    assert.equal(result?.artifact?.sections.find(s => s.id === 'review-focus')?.body, '프롬프트 scope');
    assert.match(result?.steerPrompt || '', /User-requested review focus: 프롬프트 scope/);
});

test('/review --fix remains scoped to Critical and High findings in the resolved repo', () => {
    const context = buildReviewTargetContext({
        projectDirs: [repoRoot],
    }, '20260608110000-reviewReport-fix');
    const prompt = buildReviewSteerPrompt(parseReviewFlags(['--fix']), context);

    assert.match(prompt, /auto-fix all Critical and High severity findings only/);
    assert.match(prompt, /new working-tree patch on top of current HEAD/);
    assert.match(prompt, /Do not rewrite, amend, rebase, or reset existing commits/);
    assert.match(prompt, /Update the Markdown report with the fix summary and verification result/);
});

test('/review command result carries project-dir artifact without workingDir fallback', async () => {
    const parsed = parseCommand('/review');
    const result = await executeCommand(parsed, {
        interface: 'telegram',
        locale: 'en',
        getSettings: () => ({ workingDir: weasleyPodexHome, projectDirs: null }),
    });

    assert.equal(result?.ok, true);
    assert.equal(result?.artifact?.kind, 'reviewReport');
    assert.equal(result?.artifact?.sections.some(s => s.id === 'project-root'), false);
    assert.equal(result?.artifact?.sections.find(s => s.id === 'review-target')?.body, 'Infer from recent context, then validate git repo');
    assert.match(result?.steerPrompt || '', /BLOCKED: project directory required/);
});

