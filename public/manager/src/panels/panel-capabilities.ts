import { isElectron } from './desktop-bridge';

export type ManagerSurface = 'web' | 'electron';
export type PanelFeature = 'terminal' | 'browser' | 'folder' | 'doc' | 'diff';
export type PanelCapabilityState = 'enabled' | 'disabled' | 'limited';

export type PanelCapability = {
    feature: PanelFeature;
    state: PanelCapabilityState;
    reason?: string;
};

export type PanelCapabilities = Record<PanelFeature, PanelCapability>;

function capability(feature: PanelFeature, state: PanelCapabilityState, reason?: string): PanelCapability {
    return { feature, state, ...(reason ? { reason } : {}) };
}

export function currentManagerSurface(): ManagerSurface {
    return isElectron() ? 'electron' : 'web';
}

export function resolvePanelCapabilities(surface: ManagerSurface): PanelCapabilities {
    if (surface === 'electron') {
        return {
            terminal: capability('terminal', 'enabled'),
            browser: capability('browser', 'enabled'),
            folder: capability('folder', 'enabled'),
            doc: capability('doc', 'enabled'),
            diff: capability('diff', 'enabled'),
        };
    }
    return {
        terminal: capability('terminal', 'disabled', 'Terminal requires the desktop PTY bridge.'),
        browser: capability('browser', 'disabled', 'Browser side panel is available in the desktop app.'),
        folder: capability('folder', 'disabled', 'Folder side panel is available in the desktop app; use the Jawsidian Notes tab on web.'),
        doc: capability('doc', 'disabled', 'Document side panel is available in the desktop app; use the Jawsidian document tab on web.'),
        diff: capability('diff', 'disabled', 'Diff side panel is available in the desktop app.'),
    };
}

export function panelCapabilityEnabled(capability: PanelCapability): boolean {
    return capability.state === 'enabled' || capability.state === 'limited';
}
