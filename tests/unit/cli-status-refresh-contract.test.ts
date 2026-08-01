import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..', '..');

function read(path: string): string {
    return readFileSync(join(projectRoot, path), 'utf8');
}

test('CLI status interval setting drives automatic refresh scheduling', () => {
    const status = read('public/js/features/settings-cli-status.ts');
    const main = read('public/js/main.ts');
    const html = read('public/index.html');
    const css = read('public/css/sidebar.css');

    assert.ok(html.includes('id="cliStatusInterval"'), 'CLI status interval select must exist');
    assert.ok(html.includes('id="cliStatusRefreshBtn"'), 'CLI status refresh button must be addressable for feedback state');
    assert.ok(html.includes('id="cliStatusRefreshState"'), 'CLI status refresh must expose a live status region');
    assert.ok(html.includes('aria-describedby="cliStatusRefreshState"'), 'refresh button must describe its feedback region');
    assert.ok(!html.includes('value="60"'), 'CLI status interval must not expose 1 minute');
    assert.ok(!html.includes('value="300"'), 'CLI status interval must not expose 5 minutes');
    assert.ok(!html.includes('time.1m'), 'CLI status interval must not keep 1 minute i18n wiring');
    assert.ok(!html.includes('time.5m'), 'CLI status interval must not keep 5 minute i18n wiring');
    assert.ok(html.includes('value="600"'), 'CLI status interval must expose 10 minutes');
    assert.ok(!html.includes('value="1800" selected'), 'CLI status interval must not default to 30 minutes');
    assert.ok(html.includes('data-i18n="time.30m"'), 'CLI status interval must localize 30 minutes');
    assert.ok(html.includes('value="0" selected'), 'CLI status interval must default to manual mode');

    assert.ok(status.includes('CLI_STATUS_INTERVAL_VALUES = new Set([0, 600, 1800])'), 'scheduler must allow only manual, 10 minutes, and 30 minutes');
    assert.ok(status.includes('DEFAULT_CLI_STATUS_INTERVAL_SEC = 0'), 'scheduler default must be manual');
    assert.ok(status.includes('scheduleCliStatusRefresh'), 'settings-cli-status must export an auto refresh scheduler');
    assert.ok(status.includes('window.setInterval'), 'scheduler must install a timer');
    assert.ok(status.includes('document.hidden'), 'scheduler must skip refresh while the document is hidden');
    assert.ok(status.includes('isEmbeddedPreviewFrame'), 'scheduler must allow refresh inside dashboard preview iframes without window focus');
    assert.ok(status.includes('initCliStatusPreviewHooks'), 'iframe preview must reload CLI status when preview tab becomes visible');
    assert.ok(status.includes('/api/cli-status'), 'loader must fetch cli-status before quota for progressive render');
    assert.ok(status.includes('setCliStatusRefreshFeedback'), 'forced refresh must show visible button feedback');
    assert.ok(status.includes('finishCliStatusRefreshFeedback'), 'forced refresh must show completion or failure feedback');
    assert.ok(status.includes('Refreshing quota...'), 'forced refresh must immediately tell users it is working');
    assert.ok(css.includes('.btn-refresh.is-refreshing'), 'refresh button must have a visible refreshing state');
    assert.ok(status.includes('loadCliStatus(true)'), 'timer must force a fresh status/quota refresh');
    assert.ok(status.includes('window.clearInterval'), 'scheduler must clear the previous timer');
    assert.ok(status.includes('interval <= 0'), 'manual mode must disable the timer');
    assert.ok(status.includes('setCliStatusInterval'), 'change handler must persist and reschedule the interval');

    assert.ok(main.includes('scheduleCliStatusRefresh()'), 'bootstrap must start CLI status auto refresh');
    assert.ok(main.includes('setCliStatusInterval(this.value)'), 'select changes must reschedule auto refresh');
});

test('CLI status account line hides provider noise and Google Cloud Code', () => {
    const status = read('public/js/features/settings-cli-status.ts');
    const render = read('public/js/features/settings-cli-status-render.ts');
    const source = `${status}\n${render}`;
    assert.ok(source.includes('ACCOUNT_LABEL_SKIP'), 'account line must skip noisy tier labels');
    assert.ok(source.includes('google cloud code'), 'account line must hide Google Cloud Code tier');
    assert.ok(source.includes('PROVIDER_ACCOUNT_TYPES'), 'account line must hide provider ids like cursor');
    assert.ok(!source.includes('parts.push(type)'), 'account line must not render account.type');
});

test('CLI status skips fetch while sidebar section is collapsed', () => {
    const status = read('public/js/features/settings-cli-status.ts');
    assert.ok(status.includes('if (!cliStatusExpanded) return;'), 'loadCliStatus must no-op when collapsed');
    assert.ok(status.includes('if (!cliStatusExpanded) return;\n        void loadCliStatus(false);'), 'preview visibility must not load collapsed CLI status');
    assert.ok(status.includes('scheduleEmbeddedQuotaRetry'), 'iframe quota retry must run in background');
    assert.ok(status.includes('QUOTA_LOAD_DEFER_MS'), 'initial quota fetch must defer so chat load is not starved');
    assert.ok(status.includes('scheduleQuotaFetch'), 'quota fetch must be schedulable separately from cli-status');
});
