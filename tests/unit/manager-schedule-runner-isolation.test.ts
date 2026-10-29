import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { startScheduleRunner } from '../../src/manager/schedule/runner.js';
import type { DashboardScheduledWork, ScheduleStore } from '../../src/manager/schedule/store.js';

function item(id: string, cron: string | null = '* * * * *'): DashboardScheduledWork {
    return {
        id, title: id, group: 'recurring', cron, runAt: null, targetPort: 3456,
        payload: null, enabled: true, lastRunAt: null, lastStatus: null,
        nextRunAt: null, createdAt: '', updatedAt: '',
    };
}

// Exercise the real timer callback and cron matcher without starting a server,
// opening a database, or sending work to a provider.
describe('manager schedule runner row isolation', () => {
    for (const cron of ['bad', '*/0 * * * *', '90 * * * *']) {
        it(`continues past invalid cron ${JSON.stringify(cron)}`, (t) => {
            t.mock.timers.enable({ apis: ['Date', 'setInterval'], now: new Date('2026-10-25T12:00:00Z') });
            const rows = [item('before'), item('invalid', cron), item('after')];
            const runs: string[] = [];
            const logs: string[] = [];
            const store = { list: () => rows, markRun: (id: string) => runs.push(id) } as unknown as ScheduleStore;
            const stop = startScheduleRunner(store, { intervalMs: 1000, log: line => logs.push(line) });
            try {
                assert.doesNotThrow(() => t.mock.timers.tick(1000));
                assert.deepEqual(runs, ['before', 'after']);
                assert.ok(logs.some(line => line.includes('evaluation failed for invalid')));
                assert.ok(!logs.some(line => line.includes('invalid →')));
                t.mock.timers.tick(1000);
                assert.deepEqual(runs, ['before', 'after'], 'healthy rows remain minute-deduplicated');
            } finally { stop(); }
        });
    }

    it('allows a repaired row to run in the same minute without replaying healthy rows', (t) => {
        t.mock.timers.enable({ apis: ['Date', 'setInterval'], now: new Date('2026-10-25T12:00:00Z') });
        const rows = [item('broken', 'bad'), item('healthy')];
        const runs: string[] = [];
        const store = { list: () => rows, markRun: (id: string) => runs.push(id) } as unknown as ScheduleStore;
        const stop = startScheduleRunner(store, { intervalMs: 1000 });
        try {
            assert.doesNotThrow(() => t.mock.timers.tick(1000));
            rows[0]!.cron = '* * * * *';
            t.mock.timers.tick(1000);
            assert.deepEqual(runs, ['healthy', 'broken']);
            stop();
            t.mock.timers.tick(60_000);
            assert.deepEqual(runs, ['healthy', 'broken'], 'stop still cancels the timer');
        } finally { stop(); }
    });

    it('skips disabled invalid rows and preserves one-shot due checks', (t) => {
        t.mock.timers.enable({ apis: ['Date', 'setInterval'], now: new Date('2026-10-25T12:00:00Z') });
        const disabled = { ...item('disabled', 'bad'), enabled: false };
        const due = { ...item('due', null), runAt: '2026-10-25T11:59:00Z' };
        const future = { ...item('future', null), runAt: '2026-10-26T12:00:00Z' };
        const rows = [disabled, due, future];
        const runs: string[] = [];
        const logs: string[] = [];
        const store = {
            list: () => rows,
            markRun: (id: string) => { runs.push(id); due.lastRunAt = new Date().toISOString(); },
        } as unknown as ScheduleStore;
        const stop = startScheduleRunner(store, { intervalMs: 1000, log: line => logs.push(line) });
        try {
            t.mock.timers.tick(1000);
            t.mock.timers.tick(1000);
            assert.deepEqual(runs, ['due']);
            assert.equal(logs.length, 1);
        } finally { stop(); }
    });

    it('keeps existing persistence-error isolation for later rows', (t) => {
        t.mock.timers.enable({ apis: ['Date', 'setInterval'], now: new Date('2026-10-25T12:00:00Z') });
        const runs: string[] = [];
        const logs: string[] = [];
        const store = {
            list: () => [item('write-fails'), item('healthy')],
            markRun: (id: string) => { if (id === 'write-fails') throw new Error('offline'); runs.push(id); },
        } as unknown as ScheduleStore;
        const stop = startScheduleRunner(store, { intervalMs: 1000, log: line => logs.push(line) });
        try {
            assert.doesNotThrow(() => t.mock.timers.tick(1000));
            assert.deepEqual(runs, ['healthy']);
            assert.ok(logs.some(line => line.includes('markRun failed for write-fails: offline')));
        } finally { stop(); }
    });
});
