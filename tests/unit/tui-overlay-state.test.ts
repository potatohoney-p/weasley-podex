import test from 'node:test';
import assert from 'node:assert/strict';
import { createTuiStore } from '../../src/cli/tui/store.ts';
import { dismissOverlay } from '../../bin/commands/tui/overlays.ts';
import type { TuiContext } from '../../bin/commands/tui/types.ts';

test('createOverlayState initializes settings screen closed', () => {
    const store = createTuiStore();
    assert.equal(store.overlay.settingsOpen, false);
    assert.equal(store.overlay.settingsTab, 'appearance');
    assert.equal(store.overlay.settingsSelected, 0);
    assert.equal(store.overlay.settingsMessage, '');
});

test('dismissOverlay closes fullscreen settings screen', () => {
    const store = createTuiStore();
    store.overlay.settingsOpen = true;
    store.overlay.settingsSelected = 3;
    store.overlay.settingsMessage = 'Saved Theme';
    let requested = false;
    const ctx = {
        store,
        displayMode: 'fullscreen',
        requestFrame: () => { requested = true; },
    } as unknown as TuiContext;

    dismissOverlay(ctx);

    assert.equal(store.overlay.settingsOpen, false);
    assert.equal(store.overlay.settingsTab, 'appearance');
    assert.equal(store.overlay.settingsSelected, 0);
    assert.equal(store.overlay.settingsMessage, '');
    assert.equal(requested, true);
});
