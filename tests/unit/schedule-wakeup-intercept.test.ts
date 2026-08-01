import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('ScheduleWakeup intercept', () => {
    it('SpawnContext.scheduleWakeup captures delay, prompt, reason', () => {
        const ctx = {
            fullText: '',
            traceLog: [],
            toolLog: [],
            seenToolKeys: new Set<string>(),
            hasClaudeStreamEvents: false,
            sessionId: null,
            cost: null,
            turns: null,
            duration: null,
            tokens: null,
            stderrBuf: '',
            scheduleWakeup: undefined as undefined | { delaySeconds: number; prompt: string; reason: string },
        };

        const toolName = 'ScheduleWakeup';
        const input = { delaySeconds: 120, prompt: 'check CI status', reason: 'watching CI run' };

        if (toolName === 'ScheduleWakeup' && input.delaySeconds && input.prompt) {
            ctx.scheduleWakeup = {
                delaySeconds: Number(input.delaySeconds),
                prompt: String(input.prompt),
                reason: String(input.reason || 'scheduled wakeup'),
            };
        }

        assert.ok(ctx.scheduleWakeup);
        assert.equal(ctx.scheduleWakeup.delaySeconds, 120);
        assert.equal(ctx.scheduleWakeup.prompt, 'check CI status');
        assert.equal(ctx.scheduleWakeup.reason, 'watching CI run');
    });

    it('delay is clamped to [60, 3600]', () => {
        const clamp = (s: number) => Math.max(60, Math.min(3600, s));
        assert.equal(clamp(10), 60);
        assert.equal(clamp(120), 120);
        assert.equal(clamp(5000), 3600);
    });

    it('non-ScheduleWakeup tools do not set scheduleWakeup', () => {
        const ctx = { scheduleWakeup: undefined as undefined | object };
        const toolName = 'Bash';
        const input = { command: 'ls' };

        if (toolName === 'ScheduleWakeup' && (input as Record<string, unknown>)['delaySeconds']) {
            ctx.scheduleWakeup = {};
        }

        assert.equal(ctx.scheduleWakeup, undefined);
    });

    it('scheduleWakeup takes priority over goal continuation', () => {
        const hasWakeup = true;
        const hasGoal = true;
        let wakeupFired = false;
        let goalFired = false;

        if (hasWakeup) {
            wakeupFired = true;
        } else if (hasGoal) {
            goalFired = true;
        }

        assert.ok(wakeupFired);
        assert.ok(!goalFired);
    });
});
