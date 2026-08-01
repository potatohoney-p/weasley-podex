import { Router, type RequestHandler } from 'express';
import { addTask, updateTask, listTasks, clearDone } from '../task/store.js';
import type { TaskStatus } from '../task/types.js';

export function registerTaskRoutes(app: Router, requireAuth: RequestHandler): void {
    app.get('/api/task', requireAuth, (req, res) => {
        const filter: { status?: TaskStatus; owner?: string } = {};
        if (req.query['status']) filter.status = req.query['status'] as TaskStatus;
        if (req.query['owner']) filter.owner = req.query['owner'] as string;
        const tasks = listTasks(filter);
        res.json({ ok: true, tasks });
    });

    app.post('/api/task', requireAuth, (req, res) => {
        const body = req.body as Record<string, unknown> | undefined;
        const action = String(body?.['action'] || 'add');

        switch (action) {
            case 'add': {
                const content = String(body?.['content'] || '').trim();
                if (!content) { res.status(400).json({ ok: false, error: 'content required' }); return; }
                const opts: { owner?: string; after?: string } = {};
                if (body?.['owner']) opts.owner = String(body['owner']);
                if (body?.['after']) opts.after = String(body['after']);
                const task = addTask(content, opts);
                res.json({ ok: true, task });
                return;
            }
            case 'update': {
                const id = String(body?.['id'] || '');
                if (!id) { res.status(400).json({ ok: false, error: 'id required' }); return; }
                const patch: Partial<Pick<import('../task/types.js').TaskItem, 'status' | 'owner' | 'after' | 'content'>> = {};
                if (body?.['status']) patch.status = body['status'] as TaskStatus;
                if (body?.['owner'] !== undefined) patch.owner = body['owner'] as string;
                if (body?.['after'] !== undefined) patch.after = body['after'] as string;
                if (body?.['content']) patch.content = body['content'] as string;
                const task = updateTask(id, patch);
                if (!task) { res.status(404).json({ ok: false, error: 'task not found' }); return; }
                res.json({ ok: true, task });
                return;
            }
            case 'done': {
                const id = String(body?.['id'] || '');
                if (!id) { res.status(400).json({ ok: false, error: 'id required' }); return; }
                const task = updateTask(id, { status: 'done' });
                if (!task) { res.status(404).json({ ok: false, error: 'task not found' }); return; }
                res.json({ ok: true, task });
                return;
            }
            case 'clear': {
                const removed = clearDone();
                res.json({ ok: true, removed });
                return;
            }
            default:
                res.status(400).json({ ok: false, error: `unknown action: ${action}` });
        }
    });
}
