const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const INTERVAL_MS = 80;

let frame = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let callback: ((char: string) => void) | null = null;

export function startSpinner(cb: (char: string) => void): void {
    callback = cb;
    frame = 0;
    if (timer) return;
    timer = setInterval(() => {
        frame = (frame + 1) % FRAMES.length;
        callback?.(FRAMES[frame]!);
    }, INTERVAL_MS);
}

export function stopSpinner(): void {
    if (timer) { clearInterval(timer); timer = null; }
    callback = null;
}

export function isSpinning(): boolean { return timer !== null; }
