import {
    DASHBOARD_DEFAULT_PORT,
    DASHBOARD_PREVIEW_PORT_FROM,
    MANAGED_INSTANCE_PORT_COUNT,
} from './constants.js';

const PREVIEW_PORT_BLOCK_SIZE = 100;
const MAX_TCP_PORT = 65535;

export function defaultPreviewFromForManagerPort(
    managerPort: number,
    scanCount = MANAGED_INSTANCE_PORT_COUNT,
): number {
    const defaultManagerPort = Number(DASHBOARD_DEFAULT_PORT);
    const managerOffset = Math.max(0, managerPort - defaultManagerPort);
    const candidate = DASHBOARD_PREVIEW_PORT_FROM + managerOffset * PREVIEW_PORT_BLOCK_SIZE;
    if (candidate + scanCount - 1 > MAX_TCP_PORT) return DASHBOARD_PREVIEW_PORT_FROM;
    return candidate;
}
