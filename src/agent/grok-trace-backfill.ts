import { execFileSync } from 'child_process';
import type { ToolEntry } from '../types/agent.js';

interface GrokTraceExport {
    local_path?: unknown;
}

interface GrokToolCall {
    id: string;
    name: string;
    argumentsText: string;
    resultText?: string;
    resultIsError?: boolean;
}

interface GrokTraceBackfillContext {
    sessionId: string | null;
    toolLog: ToolEntry[];
    traceLog: string[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
}

function stringValue(value: unknown): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return '';
}

function compactJson(value: unknown): string {
    if (typeof value === 'string') return value;
    if (value == null) return '';
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

function buildDetail(call: GrokToolCall): string {
    const parts = [];
    if (call.argumentsText) parts.push(`args: ${call.argumentsText}`);
    if (call.resultText) parts.push(`result: ${call.resultText}`);
    return parts.join('\n');
}

function isErrorResult(resultText: string | undefined): boolean {
    if (!resultText) return false;
    const match = resultText.match(/^exit:\s*(-?\d+)/m);
    return Boolean(match && match[1] !== '0');
}

function isErrorEvent(event: Record<string, unknown>): boolean {
    const status = stringValue(event["status"]).toLowerCase();
    return Boolean(
        event["is_error"]
        || event["error"]
        || status === 'error'
        || status === 'failed'
        || status === 'failure'
    );
}

function toolEntryFromCall(call: GrokToolCall): ToolEntry {
    const isError = Boolean(call.resultIsError) || isErrorResult(call.resultText);
    const detail = buildDetail(call);
    return {
        icon: isError ? '❌' : '✅',
        label: call.name || 'tool',
        toolType: 'tool',
        ...(detail ? { detail } : {}),
        status: isError ? 'error' : 'done',
        stepRef: `grok:tool:${call.id}`,
    };
}

export function parseGrokChatHistoryToolEntries(jsonl: string): ToolEntry[] {
    const calls = new Map<string, GrokToolCall>();
    for (const line of jsonl.split(/\r?\n/)) {
        if (!line.trim()) continue;
        let raw: unknown;
        try {
            raw = JSON.parse(line);
        } catch {
            continue;
        }
        const event = asRecord(raw);
        if (!event) continue;

        const toolCalls = Array.isArray(event["tool_calls"]) ? event["tool_calls"] : [];
        for (const rawCall of toolCalls) {
            const call = asRecord(rawCall);
            if (!call) continue;
            const id = stringValue(call["id"]) || stringValue(call["tool_call_id"]);
            if (!id) continue;
            const previous = calls.get(id);
            calls.set(id, {
                id,
                name: stringValue(call["name"]) || stringValue(call["tool_name"]) || 'tool',
                argumentsText: compactJson(call["arguments"] ?? call["args"] ?? call["input"]),
                ...(previous?.resultText ? { resultText: previous.resultText } : {}),
                ...(previous?.resultIsError ? { resultIsError: true } : {}),
            });
        }

        if (event["type"] === 'tool_result') {
            const id = stringValue(event["tool_call_id"]) || stringValue(event["tool_use_id"]) || stringValue(event["id"]);
            if (!id) continue;
            const existing = calls.get(id) || { id, name: 'tool', argumentsText: '' };
            calls.set(id, {
                ...existing,
                resultText: compactJson(event["content"] ?? event["result"] ?? event["output"] ?? event["error"]),
                ...(isErrorEvent(event) ? { resultIsError: true } : {}),
            });
        }
    }
    return Array.from(calls.values()).map(toolEntryFromCall);
}

function exportGrokTrace(sessionId: string): string | null {
    try {
        const output = execFileSync('grok', ['trace', '--local', '--json', sessionId], {
            encoding: 'utf8',
            timeout: 15_000,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        const parsed = JSON.parse(output) as GrokTraceExport;
        return typeof parsed.local_path === 'string' && parsed.local_path ? parsed.local_path : null;
    } catch {
        return null;
    }
}

function readTraceMember(archivePath: string, sessionId: string, member: string): string | null {
    try {
        return execFileSync('tar', ['-xOf', archivePath, `${sessionId}/${member}`], {
            encoding: 'utf8',
            timeout: 15_000,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
    } catch {
        return null;
    }
}

export function backfillGrokTraceTools(ctx: GrokTraceBackfillContext): number {
    if (!ctx.sessionId) return 0;
    const archivePath = exportGrokTrace(ctx.sessionId);
    if (!archivePath) return 0;
    const chatHistory = readTraceMember(archivePath, ctx.sessionId, 'chat_history.jsonl');
    if (!chatHistory) return 0;

    let added = 0;
    for (const entry of parseGrokChatHistoryToolEntries(chatHistory)) {
        if (entry.stepRef && ctx.toolLog.some((existing) => existing.stepRef === entry.stepRef)) continue;
        ctx.toolLog.push(entry);
        added += 1;
    }
    if (added > 0) {
        ctx.traceLog.push(`[grok:trace-backfill] recovered ${added} tool event(s) from ${archivePath}`);
    }
    return added;
}
