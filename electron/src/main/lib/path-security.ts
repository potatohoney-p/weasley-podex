import { realpathSync } from 'node:fs';
import { resolve, relative, sep, isAbsolute } from 'node:path';
import { homedir } from 'node:os';

let cachedHome: string | null = null;
function resolvedHome(): string {
    if (!cachedHome) cachedHome = realpathSync(homedir());
    return cachedHome;
}

export function assertContained(base: string, target: string): boolean {
    let realBase: string;
    let realTarget: string;
    try {
        realBase = realpathSync(resolve(base));
        realTarget = realpathSync(resolve(target));
    } catch {
        return false;
    }
    if (realTarget === realBase) return true;
    const rel = relative(realBase, realTarget);
    return !rel.startsWith('..') && !rel.startsWith(sep) && rel !== '';
}

export function isWithinHome(target: string): boolean {
    const home = resolvedHome();
    let realTarget: string;
    try {
        realTarget = realpathSync(resolve(target));
    } catch {
        const resolved = resolve(target);
        return resolved.startsWith(home + sep) || resolved === home;
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
