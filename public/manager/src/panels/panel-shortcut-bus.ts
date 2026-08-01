import type { DashboardShortcutAction } from '../types';

export type PanelBusAction = DashboardShortcutAction | 'closeActiveBottomTab';

type PanelShortcutHandler = (action: PanelBusAction) => boolean;

let handler: PanelShortcutHandler | null = null;

export const panelShortcutBus = {
    register(fn: PanelShortcutHandler): () => void {
        handler = fn;
        return () => { if (handler === fn) handler = null; };
    },
    dispatch(action: PanelBusAction): boolean {
        return handler?.(action) ?? false;
    },
};
