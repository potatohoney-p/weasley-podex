/**
 * Canonical environment access for Weasley Podex runtime knobs.
 *
 * New integrations must use WEASLEY_PODEX_<SUFFIX>. Historical prefix probes
 * are deliberately isolated here so the rest of the runtime cannot accidentally
 * make a legacy spelling primary again.
 */

export type WeasleyPodexEnv = NodeJS.ProcessEnv | Record<string, string | undefined>;

export function weasleyPodexEnvName(suffix: string): string {
    return `WEASLEY_PODEX_${suffix}`;
}

function legacyEnvNames(suffix: string): readonly string[] {
    return [`JAW_${suffix}`, `podex_${suffix}`];
}

export function getWeasleyPodexEnv(
    suffix: string,
    env: WeasleyPodexEnv = process.env,
): string | undefined {
    const primary = env[weasleyPodexEnvName(suffix)];
    if (primary !== undefined) return primary;
    for (const name of legacyEnvNames(suffix)) {
        const value = env[name];
        if (value !== undefined) return value;
    }
    return undefined;
}

export function hasWeasleyPodexEnv(
    suffix: string,
    env: WeasleyPodexEnv = process.env,
): boolean {
    return getWeasleyPodexEnv(suffix, env) !== undefined;
}

export function setWeasleyPodexEnv(
    suffix: string,
    value: string,
    env: WeasleyPodexEnv = process.env,
): void {
    env[weasleyPodexEnvName(suffix)] = value;
}

export function deleteWeasleyPodexEnv(
    suffix: string,
    env: WeasleyPodexEnv = process.env,
): void {
    delete env[weasleyPodexEnvName(suffix)];
}
