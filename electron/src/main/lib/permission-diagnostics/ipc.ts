import { ipcMain } from 'electron';
import { isAllowedSender } from '../ipc-origin-guard.js';
import { getLastElectronPermissionDenials } from '../electron-permissions.js';

export function registerPermissionDiagnosticsIpc(): void {
  ipcMain.handle('permissions:getLastDenials', (event) => {
    if (!isAllowedSender(event)) return { ok: false, error: 'unauthorized' };
    return { ok: true, denials: getLastElectronPermissionDenials() };
  });
}
