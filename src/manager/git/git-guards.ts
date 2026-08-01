import { existsSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, relative, resolve, sep } from 'node:path';

function resolvedHome(): string {
    try {
        return realpathSync(homedir());
    } catch {
        return resolve(homedir());
    }
}

export function isWithinHome(target: string): boolean {
    const home = resolvedHome();
    let realTarget: string;
    try {
        realTarget = realpathSync(resolve(target));
    } catch {
        const resolved = resolve(target);
        return resolved === home || resolved.startsWith(home + sep);
    }
    return realTarget === home || realTarget.startsWith(home + sep);
}

export function assertContainedLexical(base: string, target: string): boolean {
    let realBase: string;
    try {
        realBase = realpathSync(resolve(base));
    } catch {
        return false;
    }
    const resolved = resolve(realBase, target);
    const rel = relative(realBase, resolved);
    if (!rel || rel === '.') return false;
    return !rel.startsWith('..') && !isAbsolute(rel);
}

export function isValidRef(ref: string): boolean {
    if (!ref || ref.startsWith('-')) return false;
    return /^[a-zA-Z0-9_.\/~^@{}\-]+$/.test(ref);
}

export function assertExistingHomePath(path: string, label: string): string {
    if (!isAbsolute(path)) throw new Error(`${label} must be absolute`);
    const resolved = resolve(path);
    if (!existsSync(resolved)) throw new Error(`${label} does not exist`);
    if (!isWithinHome(resolved)) throw new Error(`${label} is outside home`);
    return resolved;
}
