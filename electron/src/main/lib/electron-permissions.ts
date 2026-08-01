import {
  isManagerNavigation,
  isPreviewFrameNavigation,
  type PreviewFramePolicy,
} from './navigation-policy.js';

export type ElectronPermissionSurface = 'manager-window' | 'preview-frame' | 'embedded-browser-webview';
export type ElectronPermissionDecision = 'allow' | 'deny' | 'bridge-only';

export type ElectronPermissionDenial = {
  at: string;
  surface: ElectronPermissionSurface;
  permission: string;
  requestingUrl: string;
  reason: string;
};

const DENIAL_LIMIT = 50;
const denials: ElectronPermissionDenial[] = [];

// Permissions denied on loopback-trusted manager/preview surfaces.
// Clipboard, media (mic), fullscreen, background-sync are auto-granted.
// Deny anything that could leak location, spam notifications, or access
// hardware without user intent.
const PREVIEW_DENYLIST = new Set<string>([
    'geolocation',
    'notifications',
    'midi',
    'midiSysex',
    'hid',
    'serial',
    'usb',
    'idle-detection',
]);

export function getLastElectronPermissionDenials(): ElectronPermissionDenial[] {
  return [...denials];
}

export function recordElectronPermissionDenial(input: Omit<ElectronPermissionDenial, 'at'>): void {
  denials.push({ ...input, at: new Date().toISOString() });
  while (denials.length > DENIAL_LIMIT) denials.shift();
}

function safeUrl(raw: string): string {
  try {
    return new URL(raw).toString();
  } catch {
    return '';
  }
}

function isManagerOrPreview(
  raw: string,
  managerOrigin: string,
  previewPolicy: PreviewFramePolicy,
): { manager: boolean; preview: boolean } {
  const url = safeUrl(raw);
  if (!url) return { manager: false, preview: false };
  return {
    manager: isManagerNavigation(url, managerOrigin),
    preview: isPreviewFrameNavigation(url, previewPolicy),
  };
}

export function resolveElectronPermissionDecision(args: {
  permission: string;
  requestingUrl: string;
  managerOrigin: string;
  previewPolicy: PreviewFramePolicy;
  surface: ElectronPermissionSurface;
  mediaType?: string | undefined;
}): { decision: ElectronPermissionDecision; reason: string } {
  if (args.surface === 'embedded-browser-webview') {
    return { decision: 'deny', reason: 'remote webview permissions are denied by default' };
  }
  const allowedOrigin = isManagerOrPreview(args.requestingUrl, args.managerOrigin, args.previewPolicy);
  if (!allowedOrigin.manager && !allowedOrigin.preview) {
    return { decision: 'deny', reason: 'requesting origin is outside manager/preview allowlist' };
  }
  // Manager and preview frames are the app's own loopback origins. Allow the
  // broad set of web-platform permissions they request by default instead of
  // denying-by-default; the only blocks are entries in PREVIEW_DENYLIST.
  if (PREVIEW_DENYLIST.has(args.permission)) {
    return { decision: 'deny', reason: `permission ${args.permission} is explicitly denied` };
  }
  return {
    decision: 'allow',
    reason: `permission ${args.permission} allowed for trusted manager/preview surface`,
  };
}
