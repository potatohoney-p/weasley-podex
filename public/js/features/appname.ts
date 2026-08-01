// ── Agent Name Customization ──
// localStorage-based agent display name (message label only)
// Product logo, header, and title remain branded independently.

const STORAGE_KEY = 'agentName';
const DEFAULT_NAME = 'Weasley Podex';
const LEGACY_DEFAULT_NAME = 'podex';

let currentName: string = DEFAULT_NAME;

export function getAppName(): string {
    return currentName;
}

export function setAppName(name: string): void {
    currentName = (name || '').trim() || DEFAULT_NAME;
    localStorage.setItem(STORAGE_KEY, currentName);
    // Update input field
    const input = document.getElementById('appNameInput') as HTMLInputElement | null;
    if (input) input.value = currentName;
}

export function initAppName(): void {
    const storedName = localStorage.getItem(STORAGE_KEY);
    currentName = !storedName || storedName === LEGACY_DEFAULT_NAME ? DEFAULT_NAME : storedName;
    if (storedName === LEGACY_DEFAULT_NAME) localStorage.setItem(STORAGE_KEY, DEFAULT_NAME);

    // Sync input
    const input = document.getElementById('appNameInput') as HTMLInputElement | null;
    if (input) input.value = currentName;

    // Save button
    document.getElementById('appNameSave')?.addEventListener('click', () => {
        const inp = document.getElementById('appNameInput') as HTMLInputElement | null;
        if (inp) setAppName(inp.value);
    });

    // Enter key
    document.getElementById('appNameInput')?.addEventListener('keydown', (e: Event) => {
        const ke = e as KeyboardEvent;
        if (ke.key === 'Enter') {
            ke.preventDefault();
            setAppName((ke.target as HTMLInputElement).value);
            (ke.target as HTMLInputElement).blur();
        }
    });
}
