import test from 'node:test';
import assert from 'node:assert/strict';
import {
    normalizeCursorUsageSummary,
    readCursorDashboardSessionToken,
} from '../../src/routes/quota-cursor-dashboard.ts';

test('normalizeCursorUsageSummary maps billing cycle usage windows', () => {
    const result = normalizeCursorUsageSummary({
        membershipType: 'ultra',
        billingCycleEnd: '2026-06-02T14:11:55.000Z',
        individualUsage: {
            plan: {
                used: 2000,
                limit: 2000,
                remaining: 0,
                totalPercentUsed: 100,
                apiPercentUsed: 100,
                autoPercentUsed: 12,
            },
        },
    });
    assert.equal(result.quotaCapable, true);
    assert.equal(result.quotaSource, 'cursor-dashboard-unofficial-api');
    assert.deepEqual(result.windows, [
        { label: 'Cycle', percent: 100, resetsAt: '2026-06-02T14:11:55.000Z' },
        { label: 'Auto', percent: 12, resetsAt: '2026-06-02T14:11:55.000Z' },
    ]);
});

test('readCursorDashboardSessionToken prefers CURSOR_SESSION_TOKEN', () => {
    const prevSession = process.env["CURSOR_SESSION_TOKEN"];
    const prevDashboard = process.env["CURSOR_DASHBOARD_SESSION_TOKEN"];
    process.env["CURSOR_SESSION_TOKEN"] = 'session-a';
    process.env["CURSOR_DASHBOARD_SESSION_TOKEN"] = 'session-b';
    try {
        assert.equal(readCursorDashboardSessionToken(), 'session-a');
    } finally {
        if (prevSession == null) delete process.env["CURSOR_SESSION_TOKEN"];
        else process.env["CURSOR_SESSION_TOKEN"] = prevSession;
        if (prevDashboard == null) delete process.env["CURSOR_DASHBOARD_SESSION_TOKEN"];
        else process.env["CURSOR_DASHBOARD_SESSION_TOKEN"] = prevDashboard;
    }
});
