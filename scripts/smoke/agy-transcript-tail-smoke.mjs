#!/usr/bin/env node
/**
 * Smoke: resolve AGY brain transcript path + tail-parse new JSONL lines.
 * Does not invoke agy (live tool steps require cascade; -p smokes often skip RUN_COMMAND).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const HOME = os.homedir();
const CACHE = path.join(HOME, '.gemini', 'antigravity-cli', 'cache', 'last_conversations.json');
const BRAIN = path.join(HOME, '.gemini', 'antigravity-cli', 'brain');

function resolveTranscriptPath(cwd) {
    const map = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
    const uuid = map[cwd];
    if (!uuid) return { ok: false, reason: 'no uuid in last_conversations.json for cwd' };
    const transcript = path.join(BRAIN, uuid, '.system_generated', 'logs', 'transcript.jsonl');
    if (!fs.existsSync(transcript)) return { ok: false, uuid, reason: 'transcript.jsonl missing' };
    return { ok: true, uuid, transcript };
}

function parseStepLine(line) {
    const d = JSON.parse(line);
    const type = d.type;
    const toolTypes = new Set(['RUN_COMMAND', 'VIEW_FILE', 'LIST_DIRECTORY', 'GREP_SEARCH', 'READ_FILE', 'WRITE_FILE']);
    if (!toolTypes.has(type) && type !== 'PLANNER_RESPONSE') return null;
    const label = type === 'PLANNER_RESPONSE' ? 'planner' : type.replace(/_/g, ' ').toLowerCase();
    return { step_index: d.step_index, type, status: d.status, label };
}

function tailOnce(transcript, offset) {
    const stat = fs.statSync(transcript);
    if (stat.size <= offset) return { offset, events: [] };
    const buf = Buffer.alloc(stat.size - offset);
    const fd = fs.openSync(transcript, 'r');
    fs.readSync(fd, buf, 0, buf.length, offset);
    fs.closeSync(fd);
    const text = buf.toString('utf8');
    const events = [];
    for (const line of text.split('\n')) {
        if (!line.trim()) continue;
        try {
            const ev = parseStepLine(line);
            if (ev) events.push(ev);
        } catch {
            /* skip malformed */
        }
    }
    return { offset: stat.size, events };
}

function histogram(transcript) {
    const counts = {};
    for (const line of fs.readFileSync(transcript, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        try {
            const t = JSON.parse(line).type;
            counts[t] = (counts[t] || 0) + 1;
        } catch { /* */ }
    }
    return counts;
}

const cwd = process.argv[2] || process.cwd();
const resolved = resolveTranscriptPath(cwd);
console.log(JSON.stringify({ phase: 'resolve', cwd, ...resolved }, null, 2));
if (!resolved.ok) process.exit(1);

const hist = histogram(resolved.transcript);
console.log(JSON.stringify({ phase: 'histogram', types: hist }, null, 2));

let offset = 0;
const first = tailOnce(resolved.transcript, offset);
offset = first.offset;
console.log(JSON.stringify({ phase: 'tail_baseline', offset, parsed_events: first.events.length }, null, 2));

const hasRun = (hist.RUN_COMMAND || 0) > 0;
console.log(JSON.stringify({
    phase: 'verdict',
    path_resolves: true,
    tail_parser_runs: true,
    corpus_has_RUN_COMMAND: hasRun,
    note: hasRun
        ? 'Transcript tail is viable for jaw Stage 1 when conversation uuid is known.'
        : 'This conversation has no RUN_COMMAND yet; use a cwd with tool-heavy history or resume cascade session.',
}, null, 2));

process.exit(hasRun ? 0 : 2);