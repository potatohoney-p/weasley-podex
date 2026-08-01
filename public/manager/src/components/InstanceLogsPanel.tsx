import { useState, useEffect, useRef, useCallback } from 'react';

type LogLevel = 'info' | 'warn' | 'error';

type LogLine = {
    ts: string;
    level: LogLevel;
    text: string;
};

type LogSnapshot = {
    port: number;
    fetchedAt: string;
    lines: LogLine[];
    truncated: boolean;
    source: 'runtime' | 'health' | 'none';
    reason?: string;
};

type InstanceLogsPanelProps = {
    port: number;
};

const POLL_INTERVAL_MS = 4000;
const LEVEL_CLASS: Record<LogLevel, string> = {
    info: 'log-level-info',
    warn: 'log-level-warn',
    error: 'log-level-error',
};

function formatTs(iso: string): string {
    try {
        const d = new Date(iso);
        return d.toLocaleTimeString('en-GB', { hour12: false });
    } catch {
        return iso.slice(11, 19);
    }
}

export function InstanceLogsPanel({ port }: InstanceLogsPanelProps) {
    const [snapshot, setSnapshot] = useState<LogSnapshot | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [autoScroll, setAutoScroll] = useState(true);
    const [levelFilter, setLevelFilter] = useState<LogLevel | 'all'>('all');
    const containerRef = useRef<HTMLDivElement>(null);
    const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const fetchLogs = useCallback(async () => {
        try {
            const res = await fetch(`/api/manager/instance-logs/${port}`);
            if (!res.ok) {
                setError(`HTTP ${res.status}`);
                return;
            }
            const json = await res.json() as { ok: boolean; snapshot?: LogSnapshot; error?: string };
            if (json.ok && json.snapshot) {
                setSnapshot(json.snapshot);
                setError(null);
            } else {
                setError(json.error || 'Unknown error');
            }
        } catch (e) {
            setError((e as Error).message);
        }
    }, [port]);

    useEffect(() => {
        fetchLogs();
        pollingRef.current = setInterval(fetchLogs, POLL_INTERVAL_MS);
        return () => {
            if (pollingRef.current) clearInterval(pollingRef.current);
        };
    }, [fetchLogs]);

    useEffect(() => {
        if (autoScroll && containerRef.current) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight;
        }
    }, [snapshot, autoScroll]);

    const filteredLines = snapshot?.lines.filter(
        l => levelFilter === 'all' || l.level === levelFilter,
    ) ?? [];

    if (error && !snapshot) {
        return <div className="detail-empty">Failed to load logs: {error}</div>;
    }

    if (snapshot?.source === 'none') {
        return (
            <div className="detail-empty">
                {snapshot.reason || 'No log source reachable for this instance.'}
            </div>
        );
    }

    return (
        <div className="logs-panel">
            <div className="logs-toolbar">
                <select
                    className="logs-filter"
                    value={levelFilter}
                    onChange={e => setLevelFilter(e.target.value as LogLevel | 'all')}
                >
                    <option value="all">All levels</option>
                    <option value="info">Info</option>
                    <option value="warn">Warn</option>
                    <option value="error">Error</option>
                </select>
                <label className="logs-autoscroll">
                    <input
                        type="checkbox"
                        checked={autoScroll}
                        onChange={e => setAutoScroll(e.target.checked)}
                    />
                    Auto-scroll
                </label>
                <span className="logs-meta">
                    {snapshot ? `${snapshot.lines.length} lines · source: ${snapshot.source}` : 'Loading…'}
                    {snapshot?.truncated && ' · truncated'}
                </span>
            </div>
            <div className="logs-container" ref={containerRef}>
                {filteredLines.length === 0 ? (
                    <div className="logs-empty">No log lines available.</div>
                ) : (
                    filteredLines.map((line, i) => (
                        <div key={i} className={`log-line ${LEVEL_CLASS[line.level]}`}>
                            <span className="log-ts">{formatTs(line.ts)}</span>
                            <span className="log-level">{line.level.toUpperCase()}</span>
                            <span className="log-text">{line.text}</span>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
