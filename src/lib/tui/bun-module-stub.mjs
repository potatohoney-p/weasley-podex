// Stub for `import { ... } from "bun"` in jawcode bundles running on Node.js
import { execSync, spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';

export const YAML = {
    parse(str) { return JSON.parse(str); },
    stringify(obj) { return JSON.stringify(obj, null, 2); },
};

export function $(strings, ...values) {
    const cmd = String.raw(strings, ...values);
    return {
        text: () => Promise.resolve(execSync(cmd, { encoding: 'utf-8' })),
        quiet: () => ({ text: () => Promise.resolve(execSync(cmd, { encoding: 'utf-8', stdio: 'pipe' })) }),
    };
}

export const Glob = class Glob {
    constructor(pattern) { this.pattern = pattern; }
    *scanSync(cwd) { }
};
