import { Router } from 'express';
import type { AuthMiddleware } from './types.js';
import { getSecurityAuditLog } from '../security/security-audit-log.js';

export function createSecurityAuditRouter(requireAuth: AuthMiddleware): Router {
    const router = Router();

    router.get('/entries', requireAuth, (_req, res) => {
        const limit = Math.min(Number((_req.query as Record<string, string>)['limit']) || 50, 500);
        res.json(getSecurityAuditLog().list(limit));
    });

    router.get('/verify', requireAuth, (_req, res) => {
        res.json(getSecurityAuditLog().verify());
    });

    return router;
}
