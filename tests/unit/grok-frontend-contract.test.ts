import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { providerIcon, providerLabel } from '../../public/js/provider-icons.ts';

const root = join(import.meta.dirname, '..', '..');
const src = (path: string) => readFileSync(join(root, path), 'utf8');

test('PROVIDER-GLYPH-001: provider indicators are generated centrally without brand assets', () => {
    const icons = src('public/js/provider-icons.ts');
    assert.match(icons, /const PROVIDER_GLYPHS/);
    assert.match(icons, /function renderProviderGlyph/);
    assert.match(icons, /stroke="currentColor"/);
    assert.match(icons, /aria-hidden="true"/);
    assert.doesNotMatch(icons, /\.svg\?raw|lobehub|#[0-9a-f]{3,8}/i);

    const retiredAssetDir = join(root, 'public', 'assets', 'providers');
    const remainingSvg = existsSync(retiredAssetDir)
        ? readdirSync(retiredAssetDir).filter(name => name.endsWith('.svg'))
        : [];
    assert.deepEqual(remainingSvg, []);
});

test('PROVIDER-GLYPH-002: runtime aliases resolve to neutral, accessible glyph markup', () => {
    for (const [slug, resolved, glyph, label] of [
        ['pi', 'pi', 'PI', 'Pi'],
        ['grok-build', 'grok', 'GR', 'Grok'],
        ['kiro', 'kiro-code', 'KR', 'Kiro'],
        ['cursor-agent', 'cursor', 'CU', 'Cursor'],
        ['agy', 'antigravity', 'AG', 'Antigravity'],
        ['claude-e', 'claude', 'CL', 'Claude E'],
        ['telegram', 'telegram', 'TG', 'Telegram'],
        ['discord', 'discord', 'DC', 'Discord'],
    ] as const) {
        const rendered = providerIcon(slug);
        assert.match(rendered, /^<svg[^>]+viewBox="0 0 24 24"/);
        assert.match(rendered, new RegExp(`data-provider-glyph="${resolved}"`));
        assert.match(rendered, new RegExp(`>${glyph}<\\/text>`));
        assert.match(rendered, /aria-hidden="true"/);
        assert.doesNotMatch(rendered, /<script|<style|(?:href|src)=["']https?:\/\//);
        assert.equal(providerLabel(slug), label);
    }
    assert.equal(providerIcon('not-a-provider'), '');
});

test('PROVIDER-GLYPH-003: Grok, Kiro, and Cursor aliases remain in the resolver', () => {
    const icons = src('public/js/provider-icons.ts');
    assert.match(icons, /normalized\.startsWith\('grok'\)/);
    assert.match(icons, /normalized === 'kirocode'/);
    assert.match(icons, /normalized === 'cursor'/);
    assert.match(icons, /grok:\s*\{\s*glyph:\s*'GR',[\s\S]*label:\s*'Grok'/);
    assert.match(icons, /'kiro-code':\s*\{\s*glyph:\s*'KR',[\s\S]*label:\s*'Kiro'/);
    assert.match(icons, /cursor:\s*\{\s*glyph:\s*'CU',[\s\S]*label:\s*'Cursor'/);
});

test('CODEX-FE-001: Codex surfaces use distinct neutral glyphs without OpenAI artwork', () => {
    const icons = src('public/js/provider-icons.ts');
    const codex = providerIcon('codex');
    const codexApp = providerIcon('codex-app');
    const codexMono = providerIcon('codex', 'mono');
    assert.match(icons, /'codex-app'/);
    assert.match(icons, /normalized === 'codexapp'/);
    assert.match(codex, />CX<\/text>/);
    assert.match(codexApp, />CA<\/text>/);
    assert.match(codexMono, /data-variant="mono"/);
    assert.match(codexMono, /currentColor/);
    assert.notEqual(codex, codexApp);
    assert.equal(providerLabel('codex'), 'Codex');
    assert.equal(providerLabel('codex-app'), 'Codex App');
    assert.doesNotMatch(icons, /OpenAI icon|GitHub Copilot|brand icon/i);
    assert.match(icons, /copilot:\s*\{[\s\S]*label:\s*'Copilot'/);
});

test('CURSOR-FE-001: Cursor remains a first-class runtime label', () => {
    const icons = src('public/js/provider-icons.ts');
    assert.match(icons, /normalized === 'cursor'/);
    assert.match(icons, /label:\s*'Cursor'/);
});

test('CLAUDE-E-FE-001: frontend presents claude-e as Claude E', () => {
    const meta = src('public/manager/src/settings/pages/components/agent/agent-meta.ts');
    const constants = src('public/js/constants.ts');
    const icons = src('public/js/provider-icons.ts');
    const settingsCore = src('public/js/features/settings-core.ts');
    const cliStatus = src('public/js/features/settings-cli-status.ts');
    assert.match(meta, /'claude-e':\s*\{[\s\S]*label:\s*'Claude E'/);
    assert.match(constants, /'claude-e':\s*\{[\s\S]*label:\s*'Claude E'/);
    assert.match(icons, /'claude-e':\s*'Claude E'/);
    assert.match(settingsCore, /cliDisplayLabel\(cli\)/);
    assert.match(cliStatus, /providerLabel\(name\)/);
});

test('GROK-FE-002: legacy settings fallback registry exposes grok-build without effort', () => {
    const constants = src('public/js/constants.ts');
    assert.match(constants, /grok:\s*\{/);
    assert.match(constants, /label:\s*'Grok'/);
    assert.match(constants, /models:\s*\['grok-build', 'grok-composer-2\.5-fast'\]/);
    assert.match(constants, /efforts:\s*\[\]/);
    assert.match(constants, /unsupported by grok-build/);
    assert.match(constants, /'kiro-code':\s*\{/);
    assert.match(constants, /label:\s*'Kiro'/);
    assert.match(constants, /models:\s*\[\s*'auto'/);
});

test('LEGACY-FE-001: legacy settings sidebar exposes every canonical CLI row', () => {
    const html = src('public/index.html');
    const settingsCore = src('public/js/features/settings-core.ts');
    const main = src('public/js/main.ts');

    for (const [cli, suffix] of [
        ['ai-e', 'AiE'],
        ['claude', 'Claude'],
        ['codex', 'Codex'],
        ['codex-app', 'CodexApp'],
        ['cursor', 'Cursor'],
        ['kiro-code', 'KiroCode'],
        ['gemini', 'Gemini'],
        ['grok', 'Grok'],
        ['opencode', 'Opencode'],
        ['copilot', 'Copilot'],
    ] as const) {
        assert.match(html, new RegExp(`<option value="${cli}"`), `active/flush selector must include ${cli}`);
        assert.match(html, new RegExp(`id="model${suffix}"`), `settings row must include model${suffix}`);
    }

    // claude-e is hidden from the active/flush dropdowns but keeps its (hidden) settings row.
    assert.match(html, /id="modelClaudeE"/);
    assert.match(html, /id="providerAiE"/);
    assert.match(settingsCore, /function toDomSuffix\(cli: string\)/);
    assert.match(settingsCore, /split\(\/\[\^a-zA-Z0-9\]\+\/\)/);
    assert.match(main, /function toDomSuffix\(cli: string\)/);
    assert.match(main, /onPerCliProviderChange/);
});

test('GROK-FE-003: quota renderer shows setup commands for status-only CLIs', () => {
    const status = `${src('public/js/features/settings-cli-status.ts')}\n${src('public/js/features/settings-cli-status-render.ts')}`;
    assert.match(status, /q\?\.quotaCapable === false/);
    assert.match(status, /describeStatusOnlyQuota/);
    assert.match(status, /QUOTA_SETUP_HINTS/);
    assert.match(status, /renderQuotaSetupBox/);
    assert.match(status, /grok login --oauth/);
    assert.match(status, /OPENCODE_GO_API_KEY/);
    assert.match(status, /data-cli-help-links/);
    assert.match(status, /github\.com\/anomalyco\/opencode\/issues\/16017/);
    assert.match(status, /zen\/go\/v1\/usage/);
    assert.match(status, /https:\/\/x\.ai\/cli\/install\.sh/, 'Grok install hint should point to xAI native installer');
    const forbiddenClaims = [
        ['Grok ', 'unlimited'].join(''),
        ['Grok quota ', '0%'].join(''),
        ['Grok quota ', '100%'].join(''),
    ];
    for (const claim of forbiddenClaims) {
        assert.ok(!status.includes(claim), `status renderer must not contain ${claim}`);
    }
});

test('GROK-FE-004: manager settings metadata treats Grok as normal CLI with disabled effort', () => {
    const meta = src('public/manager/src/settings/pages/components/agent/agent-meta.ts');
    const employees = src('public/manager/src/settings/pages/components/employees-helpers.ts');
    assert.match(meta, /grok:\s*\{/);
    assert.match(meta, /models:\s*\['grok-build', 'grok-composer-2\.5-fast'\]/);
    assert.match(meta, /efforts:\s*\[\]/);
    assert.match(employees, /'grok'/);
    assert.match(meta, /'codex-app':\s*\{/);
});

test('LEGACY-FE-002: fallback CLI surfaces include every canonical CLI', () => {
    const employees = src('public/manager/src/settings/pages/components/employees-helpers.ts');
    const heartbeat = src('public/manager/src/settings/pages/components/heartbeat-helpers.ts');
    const status = src('public/js/features/settings-cli-status.ts');
    const freshInstallSmoke = src('scripts/fresh-install-smoke.ts');
    for (const cli of ['ai-e', 'claude', 'claude-e', 'codex', 'codex-app', 'copilot', 'cursor', 'kiro-code', 'grok', 'opencode']) {
        assert.match(employees, new RegExp(`'${cli}'`), `manager employee fallback must include ${cli}`);
        assert.match(heartbeat, new RegExp(`'${cli}'`), `manager heartbeat fallback must include ${cli}`);
        assert.match(status, new RegExp(`'${cli}'|${cli}:`), `legacy CLI status hints must include ${cli}`);
        assert.match(freshInstallSmoke, new RegExp(`'${cli}'`), `fresh install smoke must assert ${cli} status`);
    }
});

test('AI-E-FE-001: legacy active settings store provider only in perCli', () => {
    const settingsCore = src('public/js/features/settings-core.ts');
    const saveActive = settingsCore.match(/export async function saveActiveCliSettings\(\): Promise<void> \{[\s\S]*?\n\}/)?.[0] || '';
    assert.match(saveActive, /patch\['perCli'\]\s*=\s*\{\s*\[cli\]:\s*\{\s*provider:/);
    assert.doesNotMatch(saveActive, /overrides\[cli\]\.provider\s*=/);
});

test('AI-E-FE-002: active AI-E provider change syncs per-CLI provider before rebuilding controls', () => {
    const main = src('public/js/main.ts');
    assert.match(main, /function syncAiEProviderSelectsFromActiveProvider\(eventTarget: EventTarget \| null\): void/);
    assert.match(main, /document\.getElementById\('providerAiE'\)/);
    assert.match(main, /perCliProvider\.value\s*=\s*provider/);

    const listenerStart = main.indexOf("document.getElementById('selCliProvider')?.addEventListener('change'");
    assert.ok(listenerStart >= 0, 'selCliProvider change listener must exist');
    const listenerEnd = main.indexOf("document.getElementById('selModel')", listenerStart);
    assert.ok(listenerEnd > listenerStart, 'selCliProvider listener must appear before selModel listener');
    const listener = main.slice(listenerStart, listenerEnd);
    const syncIdx = listener.indexOf('syncAiEProviderSelectsFromActiveProvider(event.target)');
    const cliChangeIdx = listener.indexOf('onCliChange()');
    assert.ok(syncIdx >= 0, 'listener must prime providerAiE from selAiEProvider');
    assert.ok(cliChangeIdx > syncIdx, 'listener must sync providerAiE before onCliChange rebuilds controls');
});
