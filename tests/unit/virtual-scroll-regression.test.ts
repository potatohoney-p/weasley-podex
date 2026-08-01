/**
 * Virtual Scroll Regression Tests (tanstack migration)
 *
 * Tests the bootstrap orchestration sequence.
 */
import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    bootstrapVirtualHistory,
    type VirtualHistoryBootstrapDeps,
} from '../../public/js/virtual-scroll-bootstrap.js';
import {
    remeasureMountedVirtualItems,
    type VirtualItem,
} from '../../public/js/virtual-scroll.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const virtualScrollSource = readFileSync(join(__dirname, '../../public/js/virtual-scroll.ts'), 'utf8');

function makeMessageFixture(count: number): VirtualItem[] {
    return Array.from({ length: count }, (_, i) => ({
        id: `msg-${i}`,
        html: `<div class="msg msg-agent"><div class="msg-content">Message ${i}</div></div>`,
        height: 80,
    }));
}

function makeDeps(log: string[]): VirtualHistoryBootstrapDeps {
    return {
        registerCallbacks: mock.fn(() => { log.push('registerCallbacks'); }),
        setItems: mock.fn((_items: VirtualItem[], opts?: { autoActivate?: boolean; toBottom?: boolean }) => {
            log.push(`setItems(count=${_items.length}, autoActivate=${opts?.autoActivate})`);
        }),
        activateIfNeeded: mock.fn((toBottom: boolean) => {
            log.push(`activateIfNeeded(toBottom=${toBottom})`);
        }),
        scrollToBottom: mock.fn(() => { log.push('scrollToBottom'); }),
        onBeforeVirtualHistoryBootstrap: mock.fn(() => { log.push('onBeforeVirtualHistoryBootstrap'); }),
        onAfterVirtualHistoryBottomed: mock.fn(() => { log.push('onAfterVirtualHistoryBottomed'); }),
    };
}

describe('bootstrapVirtualHistory', () => {
    it('executes operations in correct order for 82 messages', () => {
        const log: string[] = [];
        const items = makeMessageFixture(82);
        const deps = makeDeps(log);
        bootstrapVirtualHistory(items, deps);

        assert.deepStrictEqual(log, [
            'onBeforeVirtualHistoryBootstrap',
            'registerCallbacks',
            'setItems(count=82, autoActivate=false)',
            'activateIfNeeded(toBottom=true)',
            'scrollToBottom',
            'onAfterVirtualHistoryBottomed',
        ]);
    });

    it('registerCallbacks is called before setItems', () => {
        const log: string[] = [];
        const items = makeMessageFixture(90);
        const deps = makeDeps(log);
        bootstrapVirtualHistory(items, deps);

        const cbIdx = log.findIndex(s => s === 'registerCallbacks');
        const setIdx = log.findIndex(s => s.startsWith('setItems'));
        const beforeIdx = log.findIndex(s => s === 'onBeforeVirtualHistoryBootstrap');
        assert.ok(cbIdx < setIdx, 'registerCallbacks must precede setItems');
        assert.ok(beforeIdx < cbIdx, 'scroll tracking bind must precede virtual history bootstrap');
    });

    it('handles zero messages', () => {
        const log: string[] = [];
        const items: VirtualItem[] = [];
        const deps = makeDeps(log);
        bootstrapVirtualHistory(items, deps);

        assert.deepStrictEqual(log, [
            'onBeforeVirtualHistoryBootstrap',
            'registerCallbacks',
            'setItems(count=0, autoActivate=false)',
            'activateIfNeeded(toBottom=true)',
            'scrollToBottom',
            'onAfterVirtualHistoryBottomed',
        ]);
    });

    it('restores to saved index when restore intent is pinned away', () => {
        const log: string[] = [];
        const items = makeMessageFixture(82);
        const deps: VirtualHistoryBootstrapDeps = {
            ...makeDeps(log),
            shouldFollowBottom: mock.fn(() => false),
            scrollToIndex: mock.fn((index: number) => { log.push(`scrollToIndex(${index})`); }),
            restoreIndex: 42,
        };
        bootstrapVirtualHistory(items, deps);

        assert.deepStrictEqual(log, [
            'onBeforeVirtualHistoryBootstrap',
            'registerCallbacks',
            'setItems(count=82, autoActivate=false)',
            'activateIfNeeded(toBottom=false)',
            'scrollToIndex(42)',
        ]);
    });

    it('falls back to bottom when pinned away but no restore index', () => {
        const log: string[] = [];
        const items = makeMessageFixture(82);
        const deps: VirtualHistoryBootstrapDeps = {
            ...makeDeps(log),
            shouldFollowBottom: mock.fn(() => false),
            restoreIndex: null,
        };
        bootstrapVirtualHistory(items, deps);

        assert.deepStrictEqual(log, [
            'onBeforeVirtualHistoryBootstrap',
            'registerCallbacks',
            'setItems(count=82, autoActivate=false)',
            'activateIfNeeded(toBottom=true)',
            'scrollToBottom',
            'onAfterVirtualHistoryBottomed',
        ]);
    });

    it('setItems uses autoActivate=false', () => {
        const log: string[] = [];
        const items = makeMessageFixture(100);
        const deps = makeDeps(log);
        bootstrapVirtualHistory(items, deps);

        const setEntry = log.find(s => s.startsWith('setItems'));
        assert.ok(setEntry?.includes('autoActivate=false'));
    });

    it('remeasureMountedVirtualItems refreshes cached heights for mounted rows', () => {
        const items = makeMessageFixture(3);
        const measured = [
            { getBoundingClientRect: () => ({ height: 128 }) },
            { getBoundingClientRect: () => ({ height: 212 }) },
        ];
        const mounted = new Map<number, any>([
            [0, measured[0]],
            [2, measured[1]],
        ]);
        const calls: unknown[] = [];
        const virtualizer = {
            measureElement: (el: unknown) => {
                calls.push(el);
            },
        };

        remeasureMountedVirtualItems(items, mounted, virtualizer);

        assert.equal(items[0]?.height, 128);
        assert.equal(items[1]?.height, 80);
        assert.equal(items[2]?.height, 212);
        assert.deepEqual(calls, measured);
    });

    it('guarded restore bottom path schedules delayed remeasure passes', () => {
        assert.ok(virtualScrollSource.includes('forceBottomAfterRestore('), 'VirtualScroll should expose forced restore API');
        assert.ok(virtualScrollSource.includes('reconcileAfterRestore('), 'VirtualScroll should expose guarded restore API');
        assert.ok(virtualScrollSource.includes('setRestoreFollowPredicate('), 'VirtualScroll should accept live restore intent predicate');
        assert.ok(virtualScrollSource.includes('scheduleRestoreReconcile('), 'forced restore should use a dedicated scheduler');
        assert.ok(virtualScrollSource.includes('runRestoreReconcilePass('), 'restore scheduler should run a remeasure pass');
        assert.ok(virtualScrollSource.includes('if (shouldFollow && !shouldFollow())'), 'delayed restore passes should re-check live intent');
        assert.ok(virtualScrollSource.includes('cancelRestoreReconcile(reason)'), 'restore pass should cancel pending timers when user scrolls away');
        assert.ok(virtualScrollSource.includes('remeasureMountedVirtualItems(this.items, this.mounted, this.virtualizer)'), 'restore pass should remeasure mounted items');
        assert.ok(virtualScrollSource.includes('document.fonts?.ready'), 'restore pass should wait for font layout when available');
        assert.ok(virtualScrollSource.includes('this.scheduleRestoreTimer(reason, 250, shouldFollow)'), 'restore should run a guarded delayed 250ms pass');
        assert.ok(virtualScrollSource.includes('this.scheduleRestoreTimer(reason, 1000, shouldFollow)'), 'restore should run a guarded delayed 1000ms pass');
        assert.ok(virtualScrollSource.includes('clearRestoreTimers()'), 'restore timers should be cleaned up');
    });

    it('content-growth observer re-bottoms only while follow intent holds', () => {
        assert.ok(virtualScrollSource.includes('contentObserver.observe(this.innerEl)'), 'should observe the height-growing inner element, not the container');
        assert.ok(virtualScrollSource.includes('if (total <= prevTotal) { prevTotal = total; return; }'), 'should only act when total content height grows (ignore shrink/unchanged)');
        assert.ok(virtualScrollSource.includes('if (this.shouldFollowAfterRestore()) {'), 'content-growth re-bottom must be gated by live follow intent');
        assert.ok(virtualScrollSource.includes('cleanupFns.push(() => contentObserver.disconnect())'), 'content observer must be cleaned up');
    });

    it('ProcessBlock mutation helper preserves a passed anchor element', () => {
        assert.ok(virtualScrollSource.includes('preserveScrollDuringMutation<T>(anchorEl: Element | null'), 'mutation helper should accept preferred anchor element');
        assert.ok(virtualScrollSource.includes('captureScrollAnchor(anchorEl)'), 'mutation helper should capture the preferred anchor before mutation');
        assert.ok(virtualScrollSource.includes('restoreScrollAnchor(anchor)'), 'mutation helper should restore row-top anchor after mutation');
    });

    it('lazy media load remeasures the owning row (260611 image overlap, doc 85)', () => {
        assert.ok(virtualScrollSource.includes('this.attachMediaLoadRemeasure()'), 'constructor must wire the media-load remeasure hook');
        assert.ok(virtualScrollSource.includes("this.innerEl.addEventListener('load', remeasure, true)"), 'img load must be delegated in capture phase (load does not bubble)');
        assert.ok(virtualScrollSource.includes("this.innerEl.addEventListener('loadedmetadata', remeasure, true)"), 'video loadedmetadata must be delegated in capture phase');
        assert.ok(virtualScrollSource.includes("target.closest<HTMLElement>('[data-vs-idx]')"), 'remeasure must resolve the owning VS row from the media element');
        const hookStart = virtualScrollSource.indexOf('private attachMediaLoadRemeasure()');
        assert.ok(hookStart > -1, 'attachMediaLoadRemeasure must exist');
        const hookBody = virtualScrollSource.slice(hookStart, virtualScrollSource.indexOf("addEventListener('loadedmetadata'", hookStart));
        assert.ok(hookBody.includes('syncMeasuredItemHeight(this.items,'), 'remeasure must sync the cached item height');
        assert.ok(hookBody.includes('this.virtualizer.measureElement(row)'), 'remeasure must notify the virtualizer with the row element');
        assert.ok(hookBody.includes('if (!this._active || !this.virtualizer) return;'), 'remeasure must no-op while VS is inactive');
    });
});

describe('reconnect reload regressions (260610 ghost overlap)', () => {
    const messageHistorySource = readFileSync(join(__dirname, '../../public/js/features/message-history.ts'), 'utf8');

    it('deactivate empties the reused innerEl before detaching it', () => {
        const start = virtualScrollSource.indexOf('private deactivate()');
        assert.ok(start >= 0, 'deactivate should exist');
        const block = virtualScrollSource.slice(start, start + 1200);
        assert.ok(block.includes('this.innerEl.replaceChildren()'),
            'deactivate must clear innerEl children — the singleton re-attaches on the '
            + 'next activate, so stale children become overlapping ghost messages');
    });

    it('loadMessages keeps the live DOM when the fetched history is unchanged', () => {
        assert.ok(messageHistorySource.includes('lastRenderedSignature'),
            'loadMessages must skip teardown+rebuild for identical history (reconnect churn)');
        assert.ok(messageHistorySource.includes('signature === lastRenderedSignature'),
            'skip must compare against the rendered signature');
    });
});
