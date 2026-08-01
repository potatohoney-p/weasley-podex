import { Router } from 'express';
import { loadEntries, getActiveEntries, addEntry, removeEntry, clearAll } from '../prompt/runtime-context.js';

export function createRuntimeContextRouter(): Router {
    const router = Router();

    router.get('/', (_req, res) => {
        const entries = loadEntries();
        const activeIds = new Set(getActiveEntries().map(e => e.id));
        res.json(entries.map(e => ({ ...e, expired: !activeIds.has(e.id) })));
    });

    router.post('/', (req, res) => {
        const { text, label, expiresAt } = req.body as { text?: string; label?: string; expiresAt?: string };
        if (!text || typeof text !== 'string' || !text.trim()) {
            res.status(400).json({ error: 'text is required' });
            return;
        }
        if (text.length > 2000) {
            res.status(400).json({ error: 'text exceeds 2000 character limit' });
            return;
        }
        const opts: { label?: string; expiresAt?: string } = {};
        if (typeof label === 'string' && label.trim()) opts.label = label.trim();
        if (typeof expiresAt === 'string') opts.expiresAt = expiresAt;
        const entry = addEntry(text.trim(), opts);
        res.status(201).json(entry);
    });

    router.delete('/:id', (req, res) => {
        const { id } = req.params;
        const removed = removeEntry(id);
        if (!removed) {
            res.status(404).json({ error: 'entry not found' });
            return;
        }
        res.json({ ok: true });
    });

    router.delete('/', (_req, res) => {
        const count = clearAll();
        res.json({ cleared: count });
    });

    return router;
}
