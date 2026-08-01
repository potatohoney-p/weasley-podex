export function getDefaultTabWidth(): number { return 4; }
export function getIndentation(): string { return '  '; }
export function $flag(_name: string): boolean { return false; }
export function getDebugLogPath(): string | null { return null; }
export function $env(key: string): string | undefined { return process.env[key]; }
