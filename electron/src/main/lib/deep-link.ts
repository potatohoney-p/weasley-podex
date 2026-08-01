import type { App, BrowserWindow } from 'electron';
import { URL } from 'node:url';

export const WEASLEY_PODEX_PROTOCOL = 'weasley-podex';

const ALLOWED_ACTIONS = new Set(['open']);

export type WeasleyPodexDeepLink = {
  action: 'open';
  path: string;
};

export type DeepLinkRouteOptions = {
  managerUrl: string;
  getWindow: () => BrowserWindow | null;
  ensureReady: () => Promise<void>;
};

export function registerWeasleyPodexProtocol(app: App): boolean {
  const register = (protocol: string): boolean => (
    process.platform === 'darwin'
      ? app.setAsDefaultProtocolClient(protocol)
      : app.setAsDefaultProtocolClient(protocol, process.execPath)
  );

  return register(WEASLEY_PODEX_PROTOCOL);
}

export function extractWeasleyPodexUrlArg(argv: string[]): string | null {
  for (let i = argv.length - 1; i >= 0; i -= 1) {
    const candidate = argv[i];
    if (candidate?.startsWith(`${WEASLEY_PODEX_PROTOCOL}:`)) return candidate;
  }
  return null;
}

export function parseWeasleyPodexDeepLink(raw: string): WeasleyPodexDeepLink | null {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }

  if (parsed.protocol !== `${WEASLEY_PODEX_PROTOCOL}:`) return null;
  const action = parsed.hostname || parsed.pathname.replace(/^\/+/, '').split('/')[0];
  if (!ALLOWED_ACTIONS.has(action)) return null;

  const path = parsed.searchParams.get('path');
  if (!path || !path.startsWith('/') || path.startsWith('//')) return null;
  if (path.includes('\\') || /[\u0000-\u001F\u007F]/u.test(path)) return null;

  return { action: 'open', path };
}

export function focusWindow(window: BrowserWindow | null): boolean {
  if (!window || window.isDestroyed()) return false;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
  return true;
}

export async function routeWeasleyPodexDeepLink(
  raw: string,
  options: DeepLinkRouteOptions,
): Promise<boolean> {
  const link = parseWeasleyPodexDeepLink(raw);
  if (!link) return false;

  await options.ensureReady();
  const targetWindow = options.getWindow();
  if (!targetWindow || !focusWindow(targetWindow)) return false;

  const target = new URL(link.path, options.managerUrl);
  const managerOrigin = new URL(options.managerUrl).origin;
  if (target.origin !== managerOrigin) return false;

  await targetWindow.loadURL(target.toString());
  return true;
}
