import {
  DEFAULT_PREVIEW_PORT_COUNT,
  DEFAULT_PREVIEW_PORT_FROM,
  resolvePreviewFramePolicy,
  type PreviewFramePolicy,
} from './navigation-policy.js';

const DEFAULT_MANAGER_PORT = 24576;
const PREVIEW_PORT_BLOCK_SIZE = 100;
const MAX_TCP_PORT = 65535;

function hasExplicitPreviewFrom(env: NodeJS.ProcessEnv): boolean {
  const value = Number(env.DASHBOARD_PREVIEW_FROM);
  return Number.isInteger(value) && value > 0;
}

export function defaultPreviewFromForManagerPort(
  managerPort: number,
  previewCount = DEFAULT_PREVIEW_PORT_COUNT,
): number {
  const managerOffset = Math.max(0, managerPort - DEFAULT_MANAGER_PORT);
  const candidate = DEFAULT_PREVIEW_PORT_FROM + managerOffset * PREVIEW_PORT_BLOCK_SIZE;
  if (candidate + previewCount - 1 > MAX_TCP_PORT) return DEFAULT_PREVIEW_PORT_FROM;
  return candidate;
}

export function resolvePreviewFramePolicyForManager(
  managerPort: number,
  env: NodeJS.ProcessEnv = process.env,
): PreviewFramePolicy {
  if (hasExplicitPreviewFrom(env)) return resolvePreviewFramePolicy(env);
  const currentPolicy = resolvePreviewFramePolicy(env);
  return resolvePreviewFramePolicy({
    ...env,
    DASHBOARD_PREVIEW_FROM: String(defaultPreviewFromForManagerPort(managerPort, currentPolicy.previewCount)),
  });
}

export function previewSpawnEnvForManager(
  managerPort: number,
  env: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const policy = resolvePreviewFramePolicyForManager(managerPort, env);
  return { DASHBOARD_PREVIEW_FROM: String(policy.previewFrom) };
}
