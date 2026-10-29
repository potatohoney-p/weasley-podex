import { Router, type RequestHandler } from 'express';
import {
    getActiveRun,
    preflight,
    startRun,
    pauseRun,
    resumeRun,
    stopRun,
    completeRun,
} from '../goal-run/controller.js';
import type { GoalRunMode } from '../goal-run/types.js';
import { GoalRunStateError } from '../goal-run/persistence.js';

const VALID_MODES: GoalRunMode[] = ['dry-run', 'assist', 'bounded', 'supervised'];

export function registerGoalRunRoutes(app: Router, requireAuth: RequestHandler): void {
    app.get('/api/goal-run', requireAuth, (_req, res) => {
        try {
            const run = getActiveRun();
            res.json({ ok: true, run });
        } catch (error) {
            if (!(error instanceof GoalRunStateError)) throw error;
            res.status(error.statusCode).json({ ok: false, error: error.message, code: error.code });
        }
    });

    app.get('/api/goal-run/preflight', requireAuth, (req, res) => {
        const mode = VALID_MODES.includes(req.query['mode'] as GoalRunMode)
            ? (req.query['mode'] as GoalRunMode)
            : 'assist';
        const result = preflight(mode);
        res.json({ ok: true, ...result });
    });

    app.post('/api/goal-run', requireAuth, (req, res) => {
        const body = req.body as Record<string, unknown> | undefined;
        const action = String(body?.['action'] || 'preflight');
        try {
            switch (action) {
                case 'preflight': {
                    const mode = VALID_MODES.includes(body?.['mode'] as GoalRunMode)
                        ? (body?.['mode'] as GoalRunMode)
                        : 'assist';
                    const result = preflight(mode);
                    res.json({ ok: true, ...result });
                    return;
                }
                case 'start': {
                    const mode = VALID_MODES.includes(body?.['mode'] as GoalRunMode)
                        ? (body?.['mode'] as GoalRunMode)
                        : 'assist';
                    const run = startRun(mode);
                    const ok = run.status === 'running';
                    res.status(ok ? 200 : 400).json({ ok, run });
                    return;
                }
                case 'pause': {
                    const run = pauseRun();
                    if (!run) { res.status(400).json({ ok: false, error: 'No running goal-run to pause' }); return; }
                    res.json({ ok: true, run });
                    return;
                }
                case 'resume': {
                    const run = resumeRun();
                    if (!run) { res.status(400).json({ ok: false, error: 'No paused goal-run to resume' }); return; }
                    const ok = run.status === 'running';
                    res.status(ok ? 200 : 400).json({ ok, run });
                    return;
                }
                case 'stop': {
                    if (!body?.['confirm']) { res.status(400).json({ ok: false, error: 'Pass confirm: true to stop' }); return; }
                    const run = stopRun(body?.['reason'] as string | undefined);
                    if (!run) { res.status(404).json({ ok: false, error: 'No active goal-run' }); return; }
                    res.json({ ok: true, run });
                    return;
                }
                case 'complete': {
                    const run = completeRun();
                    if (!run) { res.status(404).json({ ok: false, error: 'No active goal-run' }); return; }
                    res.json({ ok: true, run });
                    return;
                }
                default:
                    res.status(400).json({ ok: false, error: `Unknown action: ${action}` });
            }
        } catch (err) {
            if (err instanceof GoalRunStateError) {
                res.status(err.statusCode).json({ ok: false, error: err.message, code: err.code });
                return;
            }
            res.status(500).json({ ok: false, error: (err as Error).message });
        }
    });
}
