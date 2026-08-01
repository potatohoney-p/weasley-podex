export type PiProfileMode = 'basic' | 'openai' | 'anthropic' | 'vertex';

export type PiProfileView = {
    id: string;
    label: string;
    mode: PiProfileMode;
    endpoint: string;
    apiKind?: string;
    apiKeySet?: boolean;
    apiKeyLast4?: string;
    model: string;
};

export type PiSettingsView = {
    defaultProfileId: string;
    profiles: PiProfileView[];
    discoveredModels?: Record<string, string[]>;
};

export function piModelOptions(pi: PiSettingsView | undefined, provider: string, current = ''): string[] {
    const values = new Set<string>();
    if (current) values.add(current);
    for (const model of pi?.discoveredModels?.[provider] || []) values.add(model);
    const profile = pi?.profiles?.find((entry) => entry.id === provider);
    if (profile?.model) values.add(profile.model);
    return [...values];
}

export function piProfileOptions(pi: PiSettingsView | undefined, current = ''): string[] {
    const values = new Set<string>();
    if (current) values.add(current);
    for (const profile of pi?.profiles || []) values.add(profile.id);
    return [...values];
}
