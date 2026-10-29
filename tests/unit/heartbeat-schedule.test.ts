import test from 'node:test';
import assert from 'node:assert/strict';

import {
    describeHeartbeatSchedule,
    getHeartbeatMinuteSlotKey,
    getHeartbeatScheduleTimeZone,
    matchesHeartbeatCron,
    normalizeHeartbeatSchedule,
    validateHeartbeatScheduleInput,
    validateHeartbeatCron,
} from '../../src/memory/heartbeat-schedule.ts';

test('normalizeHeartbeatSchedule defaults to every 5 minutes', () => {
    assert.deepEqual(normalizeHeartbeatSchedule(undefined), { kind: 'every', minutes: 5 });
});

test('normalizeHeartbeatSchedule preserves cron and timezone', () => {
    assert.deepEqual(
        normalizeHeartbeatSchedule({ kind: 'cron', cron: '0 9 * * *', timeZone: 'Asia/Seoul' }),
        { kind: 'cron', cron: '0 9 * * *', timeZone: 'Asia/Seoul' },
    );
});

test('matchesHeartbeatCron respects target timezone', () => {
    const now = new Date('2026-03-07T00:00:00.000Z');
    assert.equal(matchesHeartbeatCron('0 9 * * *', now, 'Asia/Seoul'), true);
    assert.equal(matchesHeartbeatCron('0 9 * * *', now, 'UTC'), false);
});

test('matchesHeartbeatCron supports weekday aliases', () => {
    const mondayUtc = new Date('2026-03-09T00:00:00.000Z');
    assert.equal(matchesHeartbeatCron('0 9 * * mon', mondayUtc, 'Asia/Seoul'), true);
});

test('validateHeartbeatCron rejects malformed expressions', () => {
    assert.match(validateHeartbeatCron('0 9 * *') || '', /5 fields/);
    assert.match(validateHeartbeatCron('61 9 * * *') || '', /out of range/);
});

test('describeHeartbeatSchedule includes timezone label', () => {
    assert.equal(
        describeHeartbeatSchedule({ kind: 'cron', cron: '0 9 * * *', timeZone: 'Asia/Seoul' }),
        'cron 0 9 * * * (Asia/Seoul)',
    );
});

test('getHeartbeatScheduleTimeZone falls back to system timezone', () => {
    assert.equal(getHeartbeatScheduleTimeZone({ kind: 'every', minutes: 5 }), Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
});

test('getHeartbeatMinuteSlotKey uses zoned minute, not raw UTC minute', () => {
    const now = new Date('2026-03-07T00:00:00.000Z');
    assert.equal(
        getHeartbeatMinuteSlotKey({ kind: 'cron', cron: '* * * * *', timeZone: 'Asia/Seoul' }, now),
        '2026-03-07 09:00 Asia/Seoul',
    );
});

test('validateHeartbeatScheduleInput returns normalized cron schedule', () => {
    const result = validateHeartbeatScheduleInput({ kind: 'cron', cron: '0   9   * * *', timeZone: 'Asia/Seoul' });
    assert.deepEqual(result, {
        ok: true,
        schedule: { kind: 'cron', cron: '0 9 * * *', timeZone: 'Asia/Seoul' },
    });
});

test('validateHeartbeatScheduleInput rejects invalid timezone', () => {
    const result = validateHeartbeatScheduleInput({ kind: 'cron', cron: '0 9 * * *', timeZone: 'Mars/Base' });
    assert.equal(result.ok, false);
    if (result.ok) assert.fail('expected validation failure');
    assert.equal(result.code, 'invalid_timezone');
});

for (const [field, weekdays] of [
    ['1-7', [0, 1, 2, 3, 4, 5, 6]],
    ['0-7', [0, 1, 2, 3, 4, 5, 6]],
    ['5-7', [0, 5, 6]],
    ['1-7/2', [0, 1, 3, 5]],
    ['0-7/2', [0, 2, 4, 6]],
    ['1/2', [0, 1, 3, 5]],
    ['7', [0]],
    ['*/7', [0]],
    ['7/2', [0]],
    ['sun', [0]],
    ['mon-fri', [1, 2, 3, 4, 5]],
    ['0,7', [0]],
] as Array<[string, number[]]>) {
    test(`weekday cron ${field} preserves numeric range and step positions`, () => {
        const cron = `0 9 * * ${field}`;
        assert.equal(validateHeartbeatCron(cron), null);
        for (let day = 0; day < 7; day++) {
            const now = new Date(Date.UTC(2026, 2, 8 + day, 9));
            assert.equal(matchesHeartbeatCron(cron, now, 'UTC'), weekdays.includes(day), `weekday ${day}`);
        }
    });
}

test('Sunday range matches the requested timezone rather than UTC weekday', () => {
    const now = new Date('2026-03-08T00:00:00Z');
    assert.equal(matchesHeartbeatCron('0 9 * * 7-7', now, 'Asia/Seoul'), true);
    assert.equal(matchesHeartbeatCron('0 16 * * 7-7', now, 'America/Los_Angeles'), false);
});

test('weekday ranges still reject reversed and out-of-range endpoints', () => {
    for (const field of ['7-1', 'fri-sun', '1-8', '-1', '8', '1-7/0']) {
        assert.notEqual(validateHeartbeatCron(`0 9 * * ${field}`), null, field);
    }
});
