import type { BrowserWindow } from 'electron';
import type { RingBuffer } from './ring-buffer.js';

const QUIT_PROGRESS_SCRIPT = `
(() => {
  const existing = document.getElementById('podex-quit-overlay');
  if (existing) return;
  const style = document.createElement('style');
  style.id = 'podex-quit-overlay-style';
  style.textContent = [
    '#podex-quit-overlay {',
    '  position: fixed;',
    '  inset: 0;',
    '  z-index: 2147483647;',
    '  display: flex;',
    '  align-items: center;',
    '  justify-content: center;',
    '  background: rgba(14, 18, 24, 0.72);',
    '  color: #f8fafc;',
    '  font: 13px/1.4 -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;',
    '  -webkit-app-region: drag;',
    '}',
    '#podex-quit-overlay .podex-quit-card {',
    '  display: flex;',
    '  align-items: center;',
    '  gap: 12px;',
    '  padding: 14px 16px;',
    '  border-radius: 8px;',
    '  background: rgba(15, 23, 42, 0.94);',
    '  border: 1px solid rgba(148, 163, 184, 0.28);',
    '  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.32);',
    '}',
    '#podex-quit-overlay .podex-quit-spinner {',
    '  width: 16px;',
    '  height: 16px;',
    '  border-radius: 999px;',
    '  border: 2px solid rgba(226, 232, 240, 0.3);',
    '  border-top-color: #f8fafc;',
    '  animation: PODEXQuitSpin 0.8s linear infinite;',
    '}',
    '@keyframes PODEXQuitSpin {',
    '  to { transform: rotate(360deg); }',
    '}',
  ].join('\\n');
  const overlay = document.createElement('div');
  overlay.id = 'podex-quit-overlay';
  overlay.setAttribute('role', 'status');
  overlay.setAttribute('aria-live', 'polite');
  overlay.innerHTML = '<div class="podex-quit-card"><div class="podex-quit-spinner" aria-hidden="true"></div><div>Quitting Weasley Podex...</div></div>';
  document.head.appendChild(style);
  document.body.appendChild(overlay);
})();
`;

export function showQuitProgress(window: BrowserWindow | null, ringBuffer: RingBuffer): void {
  if (!window || window.isDestroyed()) return;
  try {
    void window.webContents.executeJavaScript(QUIT_PROGRESS_SCRIPT, true).catch((err: unknown) => {
      ringBuffer.append(`[quit progress error] ${(err as Error)?.message ?? err}\n`);
    });
  } catch (err) {
    ringBuffer.append(`[quit progress error] ${(err as Error)?.message ?? err}\n`);
  }
}


