import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSource } from './source-normalize.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..', '..');

function read(path: string): string {
    return readSource(join(projectRoot, path), 'utf8');
}

test('cli routes dashboard command separately from serve', () => {
    const cli = read('bin/podex.ts');

    assert.ok(cli.includes("'dashboard'"), 'dashboard must be listed as a known command');
    assert.ok(cli.includes("case 'dashboard'"), 'dashboard switch case must exist');
    assert.ok(cli.includes("import('./commands/dashboard.js')"), 'dashboard must route to dashboard command');
    assert.ok(cli.includes("case 'serve'"), 'existing serve switch case must remain');
    assert.ok(cli.includes("import('./commands/serve.js')"), 'existing serve route must remain');
});

test('dashboard command declares approved defaults and implements service', () => {
    const dashboard = read('bin/commands/dashboard.ts');

    assert.ok(dashboard.includes('DASHBOARD_DEFAULT_PORT'), 'dashboard command must use manager default port constant');
    assert.ok(dashboard.includes('MANAGED_INSTANCE_PORT_FROM'), 'dashboard command must use scan start constant');
    assert.ok(dashboard.includes('MANAGED_INSTANCE_PORT_COUNT'), 'dashboard command must use scan count constant');
    assert.ok(dashboard.includes("case 'service'"), 'dashboard service must have switch case');
    assert.ok(dashboard.includes('dashboard-service'), 'dashboard service must delegate to dashboard-service module');
});

test('dashboard command pins managed instance starts to the launching Weasley Podex binary', () => {
    const dashboard = read('bin/commands/dashboard.ts');
    const instance = read('src/core/instance.ts');

    assert.ok(dashboard.includes('WEASLEY_PODEX_BIN'), 'dashboard command must pass the primary CLI path to manager server');
    assert.ok(
        dashboard.includes("WEASLEY_PODEX_BIN: getWeasleyPodexEnv('BIN') || process.argv[1] || ''"),
        'dashboard command must resolve the CLI override through the compatibility boundary before using the launching path'
    );
    assert.ok(instance.includes("const configuredBin = getWeasleyPodexEnv('BIN')"), 'getJawPath must honor the primary CLI env through the compatibility boundary');
    assert.ok(
        instance.indexOf("getWeasleyPodexEnv('BIN')") < instance.indexOf("whichWithServicePath('weasley-podex')"),
        'the primary CLI env must be checked before PATH discovery'
    );
    assert.equal(instance.includes("whichWithServicePath('podex')"), false, 'PATH discovery must not expose a retired public alias');
    assert.equal(instance.includes("whichWithServicePath('jaw')"), false, 'PATH discovery must not expose a retired public alias');
});

test('dashboard implementation does not mount into existing serve path', () => {
    const serve = read('bin/commands/serve.ts');
    const server = read('server.ts');

    assert.equal(serve.includes('dashboard'), false, 'serve.ts must not contain dashboard implementation');
    assert.equal(server.includes('installDashboardProxy'), false, 'server.ts must not install dashboard proxy');
    assert.equal(server.includes('/api/dashboard/instances'), false, 'server.ts must not mount manager-only instance routes');
    assert.equal(server.includes('/api/dashboard/lifecycle'), false, 'server.ts must not mount manager-only lifecycle routes');
});

test('dashboard proxy is installed only in manager server', () => {
    const managerServer = read('src/manager/server.ts');
    const rootServer = read('server.ts');

    assert.ok(managerServer.includes('installDashboardProxy'), 'manager server must install dashboard proxy');
    assert.equal(rootServer.includes('installDashboardProxy'), false, 'root server.ts must not install dashboard proxy');
    assert.equal(rootServer.includes('/i/:port'), false, 'root server.ts must not mount proxy routes');
});

test('dashboard fallback serves manager html without absolute dotfile path rejection', () => {
    const managerServer = read('src/manager/server.ts');

    assert.equal(managerServer.includes('resolvePackageRoot'), false, 'manager server must keep existing package root resolution');
    assert.equal(managerServer.includes('./paths.js'), false, 'manager server must not use a path helper for this fix');
    assert.ok(managerServer.includes('basename(htmlPath)'), 'manager HTML fallback must pass a basename to sendFile');
    assert.ok(managerServer.includes('root: dirname(htmlPath)'), 'manager HTML fallback must pass the directory as sendFile root');
    assert.ok(managerServer.includes("app.use('/dist'"), 'manager server must keep /dist static assets mounted');
});

test('dashboard noisy browser probe routes are handled before SPA fallback', () => {
    const managerServer = read('src/manager/server.ts');
    const wellKnownIndex = managerServer.indexOf("app.get('/.well-known/appspecific/com.chrome.devtools.json'");
    const faviconIndex = managerServer.indexOf("app.get('/favicon.ico'");
    const proxyIndex = managerServer.indexOf('installDashboardProxy(app, server');
    const fallbackIndex = managerServer.indexOf("app.get('/{*splat}'");

    assert.ok(wellKnownIndex >= 0, 'manager server must handle Chrome DevTools probe route');
    assert.ok(faviconIndex >= 0, 'manager server must handle favicon route');
    assert.ok(proxyIndex >= 0, 'manager server must install dashboard proxy route');
    assert.ok(fallbackIndex >= 0, 'manager server must keep SPA fallback route');
    assert.ok(wellKnownIndex < fallbackIndex, 'Chrome DevTools probe route must be before SPA fallback');
    assert.ok(faviconIndex < fallbackIndex, 'favicon route must be before SPA fallback');
    assert.ok(proxyIndex < fallbackIndex, 'dashboard proxy must be before SPA fallback');
});

test('dashboard serves manager favicon from the generated Weasley Podex mark', () => {
    const managerServer = read('src/manager/server.ts');
    const html = read('public/manager/index.html');

    assert.ok(managerServer.includes("app.use('/assets', express.static(join(distRoot, 'assets')))"), 'manager server must expose built public assets');
    assert.ok(managerServer.includes("res.sendFile('weasley-podex-mark.png'"), 'favicon route must serve the generated Weasley Podex mark');
    assert.ok(managerServer.includes("root: join(sourceRoot, 'assets')"), 'favicon route must resolve the generated mark from public assets');
    assert.equal(managerServer.includes("app.use('/icons'"), false, 'manager server must not expose the deleted legacy icon directory');
    assert.equal(managerServer.includes("res.sendFile('icon-192.png'"), false, 'favicon route must not serve the legacy 192 icon');
    assert.ok(html.includes('rel="icon"'), 'manager HTML must declare a favicon');
    assert.ok(html.includes('/assets/weasley-podex-mark.png'), 'manager HTML favicon must use the generated mark asset route');
    assert.equal(html.includes('/icons/icon-'), false, 'manager HTML must not reference deleted legacy icons');
    assert.equal(/shark/i.test(html), false, 'manager HTML must not reference legacy shark assets');
});

