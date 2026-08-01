import { apiJson } from '../api.js';
import type { PiSettingsView, SettingsData } from './settings-types.js';

const DEFAULT_ENDPOINTS: Record<string, string> = {
    basic: 'http://127.0.0.1:18645/v1',
    openai: 'https://api.openai.com/v1',
    anthropic: 'https://api.anthropic.com/v1/messages',
    vertex: 'https://LOCATION-aiplatform.googleapis.com/v1',
};

let cachedPi: PiSettingsView | null = null;

export function setCachedPi(pi: PiSettingsView | null | undefined): void {
    cachedPi = pi ?? null;
}

export function getCachedPi(): PiSettingsView | null {
    return cachedPi;
}

export function piProviderIds(pi?: PiSettingsView | null): string[] {
    return [...new Set((pi ?? cachedPi)?.profiles?.map((p) => p.id) || [])];
}

export function piDiscoveredModels(pi: PiSettingsView | null | undefined, provider: string): string[] {
    const src = pi ?? cachedPi;
    if (!src) return [];
    const profile = src.profiles?.find((p) => p.id === provider);
    const discovered = src.discoveredModels?.[provider] || [];
    const profileModel = profile?.model || '';
    return [...new Set([profileModel, ...discovered].filter(Boolean))];
}

export function syncPiProviderDropdown(pi?: PiSettingsView | null, savedProvider?: string): void {
    const sel = document.getElementById('providerPi') as HTMLSelectElement | null;
    if (!sel) return;
    const ids = piProviderIds(pi);
    if (!ids.length) return;
    sel.innerHTML = ids.map((id) => `<option value="${id}">${id}</option>`).join('');
    const target = savedProvider || sel.value || '';
    if (ids.includes(target)) sel.value = target;
}

export function syncPiModelDropdown(provider: string, pi?: PiSettingsView | null): void {
    const sel = document.getElementById('modelPi') as HTMLSelectElement | null;
    if (!sel) return;
    const models = piDiscoveredModels(pi, provider);
    if (!models.length) return;
    const current = sel.value || '';
    sel.innerHTML = models.map((m) => `<option value="${m}">${m}</option>`).join('')
        + '<option value="__custom__">직접 입력...</option>';
    if (models.includes(current)) sel.value = current;
    else if (models[0]) sel.value = models[0];
}

export function openPiSettingsModal(): void {
    const modal = document.getElementById('piSettingsModal');
    if (!modal) return;
    const providerSel = document.getElementById('providerPi') as HTMLSelectElement | null;
    const currentProvider = providerSel?.value || '';
    const current = cachedPi?.profiles?.find((p) => p.id === currentProvider);
    const modeEl = document.getElementById('piMode') as HTMLSelectElement | null;
    const idEl = document.getElementById('piProviderId') as HTMLInputElement | null;
    const endpointEl = document.getElementById('piEndpoint') as HTMLInputElement | null;
    const modelEl = document.getElementById('piModelInput') as HTMLInputElement | null;
    const keyEl = document.getElementById('piApiKey') as HTMLInputElement | null;
    const errEl = document.getElementById('piRegisterError');
    if (modeEl) modeEl.value = current?.mode || 'basic';
    if (idEl) idEl.value = current?.id || currentProvider || 'progrok';
    if (endpointEl) endpointEl.value = current?.endpoint || DEFAULT_ENDPOINTS['basic'] || '';
    if (modelEl) modelEl.value = current?.model || 'grok-composer-2.5-fast';
    if (keyEl) keyEl.value = '';
    if (keyEl && current?.apiKeySet) keyEl.placeholder = `set (${current.apiKeyLast4 || '****'})`;
    if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
    modal.classList.add('open');
}

export function closePiSettingsModal(): void {
    document.getElementById('piSettingsModal')?.classList.remove('open');
}

export async function registerPiProfile(): Promise<void> {
    const idEl = document.getElementById('piProviderId') as HTMLInputElement | null;
    const modeEl = document.getElementById('piMode') as HTMLSelectElement | null;
    const endpointEl = document.getElementById('piEndpoint') as HTMLInputElement | null;
    const modelEl = document.getElementById('piModelInput') as HTMLInputElement | null;
    const keyEl = document.getElementById('piApiKey') as HTMLInputElement | null;
    const errEl = document.getElementById('piRegisterError');
    const btn = document.getElementById('btnPiRegister') as HTMLButtonElement | null;

    const id = idEl?.value.trim() || '';
    const mode = modeEl?.value || 'basic';
    const endpoint = endpointEl?.value.trim() || '';
    const model = modelEl?.value.trim() || '';
    const apiKey = keyEl?.value || '';

    if (!id || !endpoint || !model) {
        if (errEl) { errEl.textContent = 'Provider ID, Endpoint, Model are required'; errEl.style.display = 'block'; }
        return;
    }
    if (btn) btn.disabled = true;
    if (errEl) { errEl.style.display = 'none'; }
    try {
        const result = await apiJson<{ models?: string[]; settings?: SettingsData }>('/api/pi/profiles/register', 'POST', {
            id, label: id, mode, endpoint, model, apiKey,
        });
        const nextPi = result?.settings?.pi;
        if (nextPi) setCachedPi(nextPi);
        syncPiProviderDropdown(nextPi);
        const providerSel = document.getElementById('providerPi') as HTMLSelectElement | null;
        if (providerSel) providerSel.value = id;
        syncPiModelDropdown(id, nextPi);
        closePiSettingsModal();
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; }
    } finally {
        if (btn) btn.disabled = false;
    }
}

export function onPiModeChange(): void {
    const modeEl = document.getElementById('piMode') as HTMLSelectElement | null;
    const endpointEl = document.getElementById('piEndpoint') as HTMLInputElement | null;
    if (!modeEl || !endpointEl) return;
    const mode = modeEl.value;
    endpointEl.value = DEFAULT_ENDPOINTS[mode] || DEFAULT_ENDPOINTS['basic'] || '';
}
