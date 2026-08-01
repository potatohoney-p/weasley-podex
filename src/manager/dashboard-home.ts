import { homedir } from 'node:os';
import { join } from 'node:path';
import { resolveHomePath } from '../core/path-expand.js';
import { getWeasleyPodexEnv, weasleyPodexEnvName } from '../core/weasley-podex-env.js';

export const DASHBOARD_HOME_ENV = weasleyPodexEnvName('DASHBOARD_HOME');
export const DEFAULT_DASHBOARD_HOME_BASENAME = 'podex-dashboard';

export function resolveDashboardHome(env: NodeJS.ProcessEnv = process.env): string {
    const raw = getWeasleyPodexEnv('DASHBOARD_HOME', env)?.trim()
        || join(homedir(), '.weasley', DEFAULT_DASHBOARD_HOME_BASENAME);
    return resolveHomePath(raw, homedir());
}

function resolveDashboardPath(parts: string[], env: NodeJS.ProcessEnv = process.env): string {
    return join(resolveDashboardHome(env), ...parts);
}

export function dashboardPath(...parts: string[]): string {
    return resolveDashboardPath(parts);
}

