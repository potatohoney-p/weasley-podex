import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../bin/commands/tui/fullscreen-mode.ts', import.meta.url), 'utf8');
const frameSource = readFileSync(new URL('../../src/cli/tui/render/frame.ts', import.meta.url), 'utf8');

test('fullscreen mouse tracking is opt-in only (native scrollback for default scroll+selection)', () => {
    assert.match(source, /ctx\.tuiConfig\['mouseTracking'\] === true/);
    assert.match(source, /function isMouseTrackingEnabled\(ctx: TuiContext\): boolean/);
    assert.match(source, /if \(isMouseTrackingEnabled\(ctx\)\) screen\.enableMouse\(\)/);
    assert.match(source, /if \(isMouseTrackingEnabled\(ctx\)\) screen\.enableMouse\(\);\s*else screen\.disableMouse\(\);/);
    assert.doesNotMatch(source, /mouseTracking.*!== false/);
});

test('fullscreen app-wheel mode gates SGR parsing and documents native selection tradeoff', () => {
    assert.match(source, /const mouseTrackingEnabled = isMouseTrackingEnabled\(ctx\)/);
    assert.match(source, /mouseTrackingEnabled && isMouseSequence\(incoming\)/);
    assert.match(source, /handleMouseEvent\(viewport, regions, parsed\.event\)/);
    assert.match(source, /viewport\.scrollBy\(ev\.kind === 'wheel-up' \? -3 : 3, h\)/);
    assert.match(frameSource, /process\.stdout\.write\('\\x1b\[\?1000h\\x1b\[\?1006h'\)/);
    assert.ok(frameSource.includes("'\\x1b[?9l\\x1b[?1000l\\x1b[?1002l\\x1b[?1003l\\x1b[?1005l\\x1b[?1006l\\x1b[?1015l\\x1b[?1016l'"));
});
