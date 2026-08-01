export class StdinBuffer {
    private listeners: Map<string, Array<(...args: unknown[]) => void>> = new Map();
    drain(): string[] { return []; }
    push(_data: string): void {}
    on(event: string, cb: (...args: unknown[]) => void): this {
        const list = this.listeners.get(event) || [];
        list.push(cb);
        this.listeners.set(event, list);
        return this;
    }
    close(): void { this.listeners.clear(); }
}
