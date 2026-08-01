import { useEffect, useMemo, useState } from 'react';
import { SelectField, TextField } from '../../fields';
import type { SettingsClient } from '../../types';
import type { PiProfileMode, PiSettingsView } from './pi-profile';

type Props = {
    client: SettingsClient;
    pi?: PiSettingsView | undefined;
    provider: string;
    model: string;
    onClose: () => void;
    onRegistered: (next: { provider: string; model: string; models: string[]; pi?: PiSettingsView | undefined }) => void;
};

const MODES: PiProfileMode[] = ['basic', 'openai', 'anthropic', 'vertex'];

function defaultEndpoint(mode: PiProfileMode): string {
    if (mode === 'anthropic') return 'https://api.anthropic.com/v1/messages';
    if (mode === 'vertex') return 'https://LOCATION-aiplatform.googleapis.com/v1';
    return 'http://127.0.0.1:18645/v1';
}

export function PiProfileDialog({ client, pi, provider, model, onClose, onRegistered }: Props) {
    const current = useMemo(
        () => pi?.profiles?.find((entry) => entry.id === provider) || pi?.profiles?.[0],
        [pi, provider],
    );
    const [mode, setMode] = useState<PiProfileMode>(current?.mode || 'basic');
    const [id, setId] = useState(current?.id || provider || 'progrok');
    const [endpoint, setEndpoint] = useState(current?.endpoint || defaultEndpoint(mode));
    const [modelId, setModelId] = useState(model || current?.model || 'grok-composer-2.5-fast');
    const [apiKey, setApiKey] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setEndpoint((value) => value || defaultEndpoint(mode));
    }, [mode]);

    const register = async () => {
        setBusy(true);
        setError(null);
        try {
            const result = await client.post<{
                models: string[];
                settings?: { pi?: PiSettingsView };
            }>('/api/pi/profiles/register', {
                id,
                label: id,
                mode,
                endpoint,
                model: modelId,
                apiKey,
            });
            onRegistered({ provider: id, model: modelId, models: result.models || [], pi: result.settings?.pi });
            onClose();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="settings-memory-modal" role="dialog" aria-modal="true" aria-labelledby="pi-profile-title">
            <div className="settings-memory-modal-card">
                <header className="settings-memory-modal-header">
                    <h3 id="pi-profile-title">Pi Settings</h3>
                    <button type="button" className="settings-action settings-action-discard" onClick={onClose}>Close</button>
                </header>
                <div className="settings-page-form">
                    <SelectField
                        id="pi-profile-mode"
                        label="Mode"
                        value={mode}
                        options={MODES.map((value) => ({ value, label: value }))}
                        onChange={(next) => setMode(next as PiProfileMode)}
                    />
                    <TextField id="pi-profile-id" label="Provider" value={id} onChange={setId} placeholder="progrok" />
                    <TextField id="pi-profile-endpoint" label="Endpoint" value={endpoint} onChange={setEndpoint} placeholder={defaultEndpoint(mode)} />
                    <TextField id="pi-profile-model" label="Model" value={modelId} onChange={setModelId} placeholder="grok-composer-2.5-fast" />
                    <TextField id="pi-profile-key" label="API Key" value={apiKey} onChange={setApiKey} placeholder={current?.apiKeySet ? `set (${current.apiKeyLast4 || '****'})` : 'empty for local proxy'} />
                    <p className="settings-empty">Default: grok-composer-2.5-fast. Bare grok-composer-2.5 currently has no verified team access.</p>
                    {error ? <p className="settings-field-error">{error}</p> : null}
                    <button type="button" className="settings-action settings-action-save" disabled={busy} onClick={() => void register()}>
                        {busy ? 'Registering...' : 'Register'}
                    </button>
                </div>
            </div>
        </div>
    );
}
