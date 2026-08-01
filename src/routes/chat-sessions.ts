// ─── Chat sessions API ────────────────────────────────
// Extracted from server.ts in Phase 2 (devlog 260609, 07 §3.5).

import type { Router } from 'express';
import { ok } from '../http/response.js';
import {
    getActiveChatSession, listChatSessions, createChatSession,
    setActiveChatSession, getChatSessionBySeq,
} from '../core/chat-sessions.js';

export function registerChatSessionRoutes(app: Router): void {
    app.get('/api/chat-sessions', (_req, res) => {
        ok(res, { sessions: listChatSessions(), active: getActiveChatSession() });
    });

    app.post('/api/chat-sessions', (req, res) => {
        const label = typeof req.body?.label === 'string' ? req.body.label.trim() || undefined : undefined;
        const session = createChatSession(label);
        ok(res, session);
    });

    app.post('/api/chat-sessions/:id/switch', (req, res): void => {
        const id = req.params["id"];
        const seq = parseInt(id, 10);
        const target = isNaN(seq) ? null : getChatSessionBySeq(seq);
        if (!target) { res.status(404).json({ error: `Session not found: ${id}` }); return; }
        setActiveChatSession(target.id);
        ok(res, { switched: target.id, seq: target.seq });
    });
}
