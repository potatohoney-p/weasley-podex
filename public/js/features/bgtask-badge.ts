// ── Background Task Badge ──
// Collapsed one-line badge above the pending-queue panel showing server-owned
// bgtask state (src/bgtask). Click toggles a drop-up list with per-task
// spinner / kind / elapsed time. Terminal transitions flash (green/red) and
// linger for RECENT_TTL_MS before disappearing. Fed by 'bgtask_update' SSE
// events; hydrated from GET /api/bgtask on connect/reconnect.

import { escapeHtml } from '../render.js';
import { ICONS } from '../icons.js';
import { api } from '../api.js';
import { t } from './i18n.js';

interface RunningTask { id: string; kind: string; startedAt: string | null }
type TerminalStatus = 'complete' | 'failed' | 'cancelled' | 'orphaned';
interface RecentTask { id: string; kind: string; status: TerminalStatus; at: number }

export interface BgtaskUpdatePayload {
    running?: RunningTask[];
    changed?: { id: string; kind: string; status: string } | null;
}

/** Narrow an arbitrary SSE message into a bgtask payload. The shared WsMessage
 * type declares `running` as boolean for other events — so this module accepts
 * unknown and validates the actual array/object shape itself. */
function narrowPayload(msg: unknown): BgtaskUpdatePayload {
    const m = (msg ?? {}) as Record<string, unknown>;
    const out: BgtaskUpdatePayload = {};
    if (Array.isArray(m['running'])) out.running = m['running'] as RunningTask[];
    const changed = m['changed'];
    if (changed && typeof changed === 'object') {
        out.changed = changed as { id: string; kind: string; status: string };
    }
    return out;
}

const RECENT_TTL_MS = 10_000;
const RECENT_MAX = 5;
const TERMINAL: ReadonlySet<string> = new Set(['complete', 'failed', 'cancelled', 'orphaned']);

let running: RunningTask[] = [];
let recent: RecentTask[] = [];
let expanded = false;
let lastCount = 0;
let elapsedTimer: ReturnType<typeof setInterval> | null = null;
let flashId: string | null = null;

export function applyBgtaskUpdate(msg: unknown): void {
    const payload = narrowPayload(msg);
    if (Array.isArray(payload.running)) running = payload.running;
    const changed = payload.changed;
    if (changed && TERMINAL.has(changed.status)) {
        recent = [
            { id: changed.id, kind: changed.kind, status: changed.status as TerminalStatus, at: Date.now() },
            ...recent.filter(r => r.id !== changed.id),
        ].slice(0, RECENT_MAX);
        flashId = changed.id;
        setTimeout(() => pruneRecent(), RECENT_TTL_MS + 50);
    }
    render();
}

export async function refreshBgtaskBadge(): Promise<void> {
    const res = await api<{ tasks: Array<RunningTask & { status: string }> }>(
        '/api/bgtask?status=running',
    ).catch(() => null);
    if (!res || !Array.isArray(res.tasks)) return;
    running = res.tasks.map(({ id, kind, startedAt }) => ({ id, kind, startedAt }));
    render();
}

function pruneRecent(): void {
    const cutoff = Date.now() - RECENT_TTL_MS;
    const next = recent.filter(r => r.at > cutoff);
    if (next.length !== recent.length) {
        recent = next;
        render();
    }
}

function elapsedLabel(startedAt: string | null): string {
    const start = Date.parse(startedAt ? `${startedAt.replace(' ', 'T')}Z` : '');
    if (!Number.isFinite(start)) return '';
    const sec = Math.max(0, Math.floor((Date.now() - start) / 1000));
    if (sec < 60) return `${sec}s`;
    if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
    return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
}

function statusIcon(status: TerminalStatus): string {
    if (status === 'complete') return '<span class="bgtask-status-icon ok" aria-hidden="true">✓</span>';
    if (status === 'cancelled') return '<span class="bgtask-status-icon dim" aria-hidden="true">∅</span>';
    return '<span class="bgtask-status-icon err" aria-hidden="true">✗</span>';
}

function renderRunningRow(item: RunningTask): string {
    return `<div class="bgtask-row" data-bgtask-id="${escapeHtml(item.id)}" title="${escapeHtml(item.id)}">
        <span class="bgtask-spinner" aria-hidden="true"></span>
        <span class="bgtask-row-kind">${escapeHtml(item.kind)}</span>
        <span class="bgtask-row-id">${escapeHtml(item.id.slice(3, 11))}</span>
        <span class="bgtask-row-elapsed" data-bgtask-started="${escapeHtml(item.startedAt ?? '')}">${elapsedLabel(item.startedAt)}</span>
    </div>`;
}

function renderRecentRow(item: RecentTask): string {
    const flash = item.id === flashId ? ` bgtask-flash-${item.status === 'complete' ? 'ok' : 'err'}` : '';
    return `<div class="bgtask-row bgtask-row-recent${flash}" data-bgtask-id="${escapeHtml(item.id)}">
        ${statusIcon(item.status)}
        <span class="bgtask-row-kind">${escapeHtml(item.kind)}</span>
        <span class="bgtask-row-status">${escapeHtml(item.status)}</span>
    </div>`;
}

function render(): void {
    const host = document.getElementById('bgtaskBadge');
    if (!host) return;
    pruneTimerSync();
    if (running.length === 0 && recent.length === 0) {
        host.classList.remove('visible');
        host.innerHTML = '';
        lastCount = 0;
        stopElapsedTimer();
        return;
    }
    const count = running.length;
    const pop = count !== lastCount ? ' bgtask-count-pop' : '';
    lastCount = count;
    host.classList.add('visible');
    host.classList.toggle('expanded', expanded);
    host.innerHTML = `
        <button class="bgtask-header" type="button" aria-expanded="${expanded}" title="${escapeHtml(t('bgtask.title'))}">
            ${ICONS.hourglass}
            <span class="bgtask-title" data-i18n="bgtask.title">${escapeHtml(t('bgtask.title'))}</span>
            <span class="bgtask-count${pop}">${count}</span>
            <span class="bgtask-chevron" aria-hidden="true">${expanded ? '▾' : '▸'}</span>
        </button>
        ${expanded ? `<div class="bgtask-list">
            ${running.map(renderRunningRow).join('')}
            ${recent.map(renderRecentRow).join('')}
        </div>` : ''}
    `;
    flashId = null; // flash class applied once per transition
    if (expanded && running.length > 0) startElapsedTimer();
    else stopElapsedTimer();
}

function pruneTimerSync(): void {
    const cutoff = Date.now() - RECENT_TTL_MS;
    recent = recent.filter(r => r.at > cutoff);
}

function startElapsedTimer(): void {
    if (elapsedTimer) return;
    elapsedTimer = setInterval(() => {
        document.querySelectorAll<HTMLElement>('.bgtask-row-elapsed').forEach(el => {
            el.textContent = elapsedLabel(el.dataset['bgtaskStarted'] || null);
        });
    }, 1000);
}

function stopElapsedTimer(): void {
    if (!elapsedTimer) return;
    clearInterval(elapsedTimer);
    elapsedTimer = null;
}

export function initBgtaskBadge(): void {
    const host = document.getElementById('bgtaskBadge');
    if (!host) return;
    host.addEventListener('click', (e) => {
        if (!(e.target as HTMLElement)?.closest('.bgtask-header')) return;
        expanded = !expanded;
        render();
    });
    refreshBgtaskBadge().catch(() => { /* hydrates on first bgtask_update */ });
}
