import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { JAW_HOME } from '../core/config.js';

export type SecurityEventType =
    | 'service_start'
    | 'service_stop'
    | 'dispatch_start'
    | 'dispatch_end'
    | 'settings_change'
    | 'auth_success'
    | 'auth_fail'
    | 'file_access'
    | 'network_acl_block'
    | 'scope_violation';

export type SecurityAuditEntry = {
    id: string;
    event_type: SecurityEventType;
    actor: string;
    details: Record<string, unknown>;
    timestamp: string;
    prev_hash: string;
    hash: string;
};

export type VerifyResult = {
    ok: boolean;
    totalRows: number;
    firstTamperedAt?: number;
    error?: string;
};

type Row = {
    id: string;
    event_type: string;
    actor: string;
    details_json: string;
    timestamp: string;
    prev_hash: string;
    hash: string;
};

const DB_PATH = join(JAW_HOME, 'security-audit.db');

function ensureDir(p: string): void {
    const d = dirname(p);
    if (!existsSync(d)) mkdirSync(d, { recursive: true });
}

function computeHash(fields: {
    event_type: string;
    actor: string;
    details_json: string;
    timestamp: string;
    prev_hash: string;
}): string {
    const payload = JSON.stringify({
        event_type: fields.event_type,
        actor: fields.actor,
        details_json: fields.details_json,
        timestamp: fields.timestamp,
        prev_hash: fields.prev_hash,
    });
    return createHash('sha256').update(payload).digest('hex');
}

export class SecurityAuditLog {
    private readonly db: Database.Database;

    constructor(dbPath = DB_PATH) {
        ensureDir(dbPath);
        this.db = new Database(dbPath);
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('busy_timeout = 5000');
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS security_audit (
                id          TEXT PRIMARY KEY,
                event_type  TEXT NOT NULL,
                actor       TEXT NOT NULL,
                details_json TEXT NOT NULL DEFAULT '{}',
                timestamp   TEXT NOT NULL,
                prev_hash   TEXT NOT NULL,
                hash        TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_sec_audit_ts
              ON security_audit(timestamp DESC);
        `);
    }

    private getLastHash(): string {
        const row = this.db.prepare(
            'SELECT hash FROM security_audit ORDER BY timestamp DESC LIMIT 1'
        ).get() as { hash: string } | undefined;
        return row?.hash ?? '0'.repeat(64);
    }

    append(event_type: SecurityEventType, actor: string, details: Record<string, unknown> = {}): SecurityAuditEntry {
        const id = `sec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const timestamp = new Date().toISOString();
        const prev_hash = this.getLastHash();
        const details_json = JSON.stringify(details);
        const hash = computeHash({ event_type, actor, details_json, timestamp, prev_hash });

        this.db.prepare(`
            INSERT INTO security_audit (id, event_type, actor, details_json, timestamp, prev_hash, hash)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(id, event_type, actor, details_json, timestamp, prev_hash, hash);

        return { id, event_type: event_type, actor, details, timestamp, prev_hash, hash };
    }

    list(limit = 50): SecurityAuditEntry[] {
        const safe = Number.isFinite(limit) && limit > 0 && limit <= 500 ? Math.floor(limit) : 50;
        const rows = this.db.prepare(
            'SELECT * FROM security_audit ORDER BY timestamp DESC LIMIT ?'
        ).all(safe) as Row[];
        return rows.map(r => ({
            ...r,
            event_type: r.event_type as SecurityEventType,
            details: JSON.parse(r.details_json),
        }));
    }

    verify(): VerifyResult {
        const rows = this.db.prepare(
            'SELECT * FROM security_audit ORDER BY timestamp ASC'
        ).all() as Row[];

        if (rows.length === 0) return { ok: true, totalRows: 0 };

        let prev_hash = '0'.repeat(64);
        for (let i = 0; i < rows.length; i++) {
            const r = rows[i]!;
            const expected = computeHash({
                event_type: r.event_type,
                actor: r.actor,
                details_json: r.details_json,
                timestamp: r.timestamp,
                prev_hash,
            });
            if (expected !== r.hash) {
                return { ok: false, totalRows: rows.length, firstTamperedAt: i };
            }
            prev_hash = r.hash;
        }
        return { ok: true, totalRows: rows.length };
    }

    close(): void {
        this.db.close();
    }
}

let _instance: SecurityAuditLog | null = null;

export function getSecurityAuditLog(): SecurityAuditLog {
    if (!_instance) _instance = new SecurityAuditLog();
    return _instance;
}
