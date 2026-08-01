import type { Request, Response, Router } from 'express';
import { Router as createRouter } from 'express';
import { APP_VERSION } from '../../core/config.js';

export const podex_ELECTRON_HEADER = 'x-podex-electron';
export const podex_DESKTOP_DOWNLOAD_URL = 'https://github.com/potatohoney-p/podex/releases/latest';

export type DesktopStatusResponse = {
    inDesktop: boolean;
    version: string;
    downloadUrl: string;
};

export function readDesktopStatus(req: Request): DesktopStatusResponse {
    return {
        inDesktop: req.header(podex_ELECTRON_HEADER) === '1',
        version: APP_VERSION,
        downloadUrl: podex_DESKTOP_DOWNLOAD_URL,
    };
}

export function createDesktopStatusRouter(): Router {
    const router = createRouter();
    router.get('/', (req: Request, res: Response<DesktopStatusResponse>) => {
        res.json(readDesktopStatus(req));
    });
    return router;
}

