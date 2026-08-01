import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { isAllowedOriginHeader } from '../security.js';
import { readFileSync } from 'node:fs';
import { timingSafeEqual, randomBytes } from 'node:crypto';

export type NotesAuthOptions = {
    managerPort: number;
    settingsPath: string;
};

type NotesSettings = {
    notes?: {
        apiKey?: string;
        allowedOrigins?: string[];
    };
};

function readNotesSettings(settingsPath: string): NotesSettings {
    try {
        return JSON.parse(readFileSync(settingsPath, 'utf8')) as NotesSettings;
    } catch {
        return {};
    }
}

function safeEqual(a: string, b: string): boolean {
    const ab = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ab.length !== bb.length) return false;
    return timingSafeEqual(ab, bb);
}

function isValidApiKey(req: Request, expectedKey: string): boolean {
    const bearer = req.headers.authorization;
    if (bearer && bearer.startsWith('Bearer ')) {
        const token = bearer.slice(7).trim();
        if (token.length > 0 && safeEqual(token, expectedKey)) return true;
    }
    const headerKey = req.headers['x-api-key'];
    if (typeof headerKey === 'string' && safeEqual(headerKey, expectedKey)) return true;
    return false;
}

function isLoopbackConnection(req: Request): boolean {
    const addr = req.socket.remoteAddress;
    if (!addr) return false;
    return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

export function requireNotesAuth(options: NotesAuthOptions): RequestHandler {
    const { managerPort, settingsPath } = options;
    const localhostOrigins = [
        `http://127.0.0.1:${managerPort}`,
        `http://localhost:${managerPort}`,
    ];

    return (req: Request, res: Response, next: NextFunction) => {
        const isLoopback = isLoopbackConnection(req);
        if (isLoopback) {
            const validOrigin = isAllowedOriginHeader(req.headers.origin, {
                allowedOrigins: localhostOrigins,
                allowMissing: true,
            });
            if (validOrigin) {
                next();
                return;
            }
        }

        const settings = readNotesSettings(settingsPath);
        const apiKey = settings.notes?.apiKey;
        if (!apiKey) {
            res.status(403).json({
                ok: false,
                code: 'notes_origin_forbidden',
                error: 'Notes API access requires an API key for non-localhost requests.',
            });
            return;
        }

        if (!isValidApiKey(req, apiKey)) {
            res.status(401).json({
                ok: false,
                code: 'notes_auth_invalid',
                error: 'Invalid or missing API key.',
            });
            return;
        }

        const allowedOrigins = settings.notes?.allowedOrigins ?? [];
        if (req.headers.origin && allowedOrigins.length > 0) {
            const originAllowed = isAllowedOriginHeader(req.headers.origin, {
                allowedOrigins,
                allowMissing: true,
            });
            if (originAllowed) {
                res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
                res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');
                res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
            }
        }

        next();
    };
}

export function notesCorsPreflight(options: NotesAuthOptions): RequestHandler {
    const { managerPort, settingsPath } = options;
    const localhostOrigins = [
        `http://127.0.0.1:${managerPort}`,
        `http://localhost:${managerPort}`,
    ];
    return (req: Request, res: Response, next: NextFunction) => {
        if (req.method !== 'OPTIONS') {
            next();
            return;
        }
        const origin = req.headers.origin;
        if (origin) {
            const settings = readNotesSettings(settingsPath);
            const allowed = [...localhostOrigins, ...(settings.notes?.allowedOrigins ?? [])];
            if (allowed.includes(origin)) {
                res.setHeader('Access-Control-Allow-Origin', origin);
            }
        }
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
        res.setHeader('Access-Control-Max-Age', '86400');
        res.status(204).end();
    };
}

export function generateApiKey(): string {
    return randomBytes(32).toString('hex');
}

export function getAuthStatus(settingsPath: string): { hasApiKey: boolean; allowedOrigins: string[] } {
    const settings = readNotesSettings(settingsPath);
    return {
        hasApiKey: Boolean(settings.notes?.apiKey),
        allowedOrigins: settings.notes?.allowedOrigins ?? [],
    };
}
