// Boss-only dispatch token. Generated at server startup, injected into the
// server process env, and propagated to child processes UNLESS they are
// employee spawns. Employee spawns strip this token in `makeCleanEnv`, so
// employee CLIs cannot hit `/api/orchestrate/dispatch` even though they
// share the same localhost privilege as the main agent.

import crypto from 'crypto';
import { getWeasleyPodexEnv, setWeasleyPodexEnv, weasleyPodexEnvName } from './weasley-podex-env.js';

const TOKEN_ENV = weasleyPodexEnvName('BOSS_TOKEN');

let bossToken: string | null = null;

export function initBossToken(): string {
    if (bossToken) return bossToken;
    const fromEnv = getWeasleyPodexEnv('BOSS_TOKEN');
    if (fromEnv && fromEnv.length >= 32) {
        bossToken = fromEnv;
    } else {
        bossToken = crypto.randomBytes(32).toString('hex');
        setWeasleyPodexEnv('BOSS_TOKEN', bossToken);
    }
    return bossToken;
}

export function getBossToken(): string {
    return bossToken || '';
}

export function verifyBossToken(candidate: string): boolean {
    if (!bossToken || !candidate) return false;
    if (candidate.length !== bossToken.length) return false;
    try {
        return crypto.timingSafeEqual(
            Buffer.from(candidate, 'utf8'),
            Buffer.from(bossToken, 'utf8'),
        );
    } catch {
        return false;
    }
}

export { TOKEN_ENV as BOSS_TOKEN_ENV };
