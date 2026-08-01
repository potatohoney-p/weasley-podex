import { getDesktop, isElectron as isElectronCheck } from '../panels/desktop-bridge';
import type { TerminalBridgeApi } from '../panels/desktop-bridge';

export type { TerminalBridgeApi };

export function getTerminalBridge(): TerminalBridgeApi | null {
    return getDesktop()?.terminal ?? null;
}

export function isElectron(): boolean {
    return isElectronCheck();
}
