export type KeybindingAction = string;
export class KeybindingsManager {
    match(_key: string): KeybindingAction | null { return null; }
    matches(_key: string): KeybindingAction | null { return null; }
}
export function getKeybindings(): KeybindingsManager { return new KeybindingsManager(); }
export function getDefaultKeybindings(): KeybindingsManager { return new KeybindingsManager(); }
