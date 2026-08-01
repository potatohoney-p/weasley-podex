/**
 * #233 — Manager event stream hook.
 *
 * Subscribes to GET /api/manager/events/stream (SSE) and invokes the callback
 * when a worker's settings change (cli/model/projectDirs). Complements the
 * 5s/10s polls, which only carry message activity — without this, sidebar
 * metadata waits for a manual refresh. EventSource owns reconnection while the
 * tab is visible; hidden tabs close the stream and reconnect on visibility.
 */

import { useEffect, useRef } from 'react';

type StreamFrame = {
    topic?: string;
    event?: string;
    data?: { port?: number };
};

export function useManagerEventStream(onSettingsChange: (port: number) => void): void {
    const callbackRef = useRef(onSettingsChange);
    callbackRef.current = onSettingsChange;

    useEffect(() => {
        let source: EventSource | null = null;

        const close = (): void => {
            source?.close();
            source = null;
        };

        const open = (): void => {
            if (source || document.hidden) return;
            source = new EventSource('/api/manager/events/stream');
            source.onmessage = (e: MessageEvent) => {
                let frame: StreamFrame;
                try {
                    frame = JSON.parse(String(e.data)) as StreamFrame;
                } catch {
                    return; // malformed frame — ignore
                }
                if (frame.topic !== 'worker' || frame.event !== 'worker_settings_change') return;
                const port = frame.data?.port;
                if (typeof port === 'number' && Number.isInteger(port)) callbackRef.current(port);
            };
        };

        const onVisibilityChange = (): void => {
            if (document.hidden) {
                close();
                return;
            }
            open();
        };

        open();
        document.addEventListener('visibilitychange', onVisibilityChange);
        return () => {
            document.removeEventListener('visibilitychange', onVisibilityChange);
            close();
        };
    }, []);
}
