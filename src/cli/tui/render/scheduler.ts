/**
 * Coalesced frame scheduler (~16ms) for alt-screen redraw (Phase 4).
 */

export interface FrameScheduler {
    request(): void;
    flush(): void;
    dispose(): void;
}

export function createScheduler(draw: () => void, targetMs = 16): FrameScheduler {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let pending = false;

    const run = (): void => {
        timer = null;
        if (!pending) return;
        pending = false;
        draw();
    };

    return {
        request(): void {
            pending = true;
            if (timer) return;
            timer = setTimeout(run, targetMs);
        },
        flush(): void {
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
            pending = false;
            draw();
        },
        dispose(): void {
            if (timer) clearTimeout(timer);
            timer = null;
            pending = false;
        },
    };
}
