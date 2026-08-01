import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import {
    createPreviewOriginProxyController,
    previewPortForTargetPort,
    validatePreviewOriginProxyOptions,
} from '../../src/manager/preview-origin-proxy.js';
import { injectPreviewLinkPolicy } from '../../src/manager/preview-link-policy.js';

const usedTestPorts = new Set<number>();

async function freePort(): Promise<number> {
    return await new Promise((resolve, reject) => {
        const server = http.createServer();
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            server.close(() => typeof address === 'object' && address ? resolve(address.port) : reject(new Error('no port')));
        });
    });
}

async function canListen(port: number): Promise<boolean> {
    return await new Promise(resolve => {
        const server = http.createServer();
        server.once('error', () => resolve(false));
        server.listen(port, '127.0.0.1', () => {
            server.close(() => resolve(true));
        });
    });
}

async function canListenRange(start: number, count: number): Promise<boolean> {
    for (let offset = 0; offset < count; offset += 1) {
        if (usedTestPorts.has(start + offset) || !(await canListen(start + offset))) {
            return false;
        }
    }
    return true;
}

async function freePortFrom(start: number, end: number): Promise<number> {
    for (let port = start; port <= end; port += 1) {
        if (!usedTestPorts.has(port) && await canListen(port)) {
            usedTestPorts.add(port);
            return port;
        }
    }
    throw new Error(`could not allocate a free test port in ${start}-${end}`);
}

async function freePortPair(scanCount = 1): Promise<{ targetPort: number; previewFrom: number }> {
    const targetPort = await freePortFrom(21000, 22000);
    let previewFrom = 0;
    for (let port = 24602; port <= 24665 - scanCount + 1; port += 1) {
        if (await canListenRange(port, scanCount)) {
            previewFrom = port;
            break;
        }
    }
    if (!previewFrom) throw new Error(`could not allocate a free preview range for ${scanCount} ports`);
    for (let port = previewFrom; port < previewFrom + scanCount; port += 1) {
        usedTestPorts.add(port);
    }
    return { targetPort, previewFrom };
}

async function requestText(port: number, path: string, headers: http.OutgoingHttpHeaders = {}): Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders }> {
    return await new Promise((resolve, reject) => {
        const req = http.request({
            hostname: '127.0.0.1',
            port,
            path,
            headers,
        }, (res) => {
            let body = '';
            res.setEncoding('utf8');
            res.on('data', chunk => { body += chunk; });
            res.on('end', () => resolve({ status: res.statusCode || 0, body, headers: res.headers }));
        });
        req.on('error', reject);
        req.end();
    });
}

async function startTarget(port: number): Promise<{ close(): Promise<void>; hits: string[]; headers: http.IncomingHttpHeaders[] }> {
    const hits: string[] = [];
    const headers: http.IncomingHttpHeaders[] = [];
    const server = http.createServer((req, res) => {
        hits.push(req.url || '/');
        headers.push(req.headers);
        if (req.url === '/redirect') {
            res.writeHead(302, { location: `http://127.0.0.1:${port}/next` }).end();
            return;
        }
        if (req.url === '/links') {
            const body = '<!doctype html><html><head><title>links</title></head><body><a href="https://example.com">External</a><a href="/local">Local</a></body></html>';
            res.writeHead(200, {
                'content-type': 'text/html; charset=utf-8',
                'content-length': String(Buffer.byteLength(body)),
                'content-security-policy': "frame-ancestors 'none'",
            });
            res.end(body);
            return;
        }
        res.writeHead(200, {
            'content-type': 'text/plain',
            'x-frame-options': 'DENY',
            'content-security-policy': "frame-ancestors 'none'",
        });
        res.end('ok');
    });
    server.on('upgrade', (req, socket) => {
        hits.push(req.url || '/');
        socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n');
        socket.end();
    });
    await new Promise<void>(resolve => server.listen(port, '127.0.0.1', () => resolve()));
    return { hits, headers, close: () => new Promise(resolve => server.close(() => resolve())) };
}

async function startPersistentWebSocketTarget(port: number): Promise<{ close(): Promise<void>; hits: string[] }> {
    const hits: string[] = [];
    const sockets = new Set<net.Socket>();
    const server = http.createServer();
    server.on('upgrade', (req, socket) => {
        hits.push(req.url || '/');
        sockets.add(socket);
        socket.on('close', () => sockets.delete(socket));
        socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n');
    });
    await new Promise<void>(resolve => server.listen(port, '127.0.0.1', () => resolve()));
    return {
        hits,
        close: async () => {
            for (const socket of sockets) socket.destroy();
            await new Promise<void>(resolve => server.close(() => resolve()));
        },
    };
}

test('maps target 3457 to preview 24602 by default', () => {
    const range = validatePreviewOriginProxyOptions({ scanFrom: 3457, scanCount: 50, previewFrom: 24602, managerPort: 24576 });
    assert.equal(previewPortForTargetPort(3457, range), 24602);
});

test('rejects invalid preview or manager port ranges', () => {
    assert.throws(() => validatePreviewOriginProxyOptions({ scanFrom: 3457, scanCount: 50, previewFrom: 3500, managerPort: 24576 }), /overlap/);
    assert.throws(() => validatePreviewOriginProxyOptions({ scanFrom: 3457, scanCount: 50, previewFrom: 24602, managerPort: 24602 }), /manager port/);
    assert.throws(() => validatePreviewOriginProxyOptions({ scanFrom: 3457, scanCount: 50, previewFrom: 24602, managerPort: 3457 }), /manager port/);
});

test('controller binds only requested online targets and proxies root paths', async () => {
    const { targetPort, previewFrom } = await freePortPair(2);
    const target = await startTarget(targetPort);
    const controller = createPreviewOriginProxyController({ scanFrom: targetPort, scanCount: 2, previewFrom, managerPort: 24576 });
    try {
        assert.equal(controller.snapshot().instances[String(targetPort)]?.status, 'unavailable');
        assert.equal(await canListen(previewFrom), true);
        await controller.ensureTarget(targetPort);
        assert.equal(controller.snapshot().instances[String(targetPort)]?.status, 'ready');
        assert.equal(controller.snapshot().instances[String(targetPort + 1)]?.status, 'unavailable');
        assert.equal(await canListen(previewFrom + 1), true);

        const response = await requestText(previewFrom, '/api/health', {
            host: `127.0.0.1:${previewFrom}`,
            origin: `http://127.0.0.1:${previewFrom}`,
        });
        assert.equal(response.body, 'ok');
        assert.equal(response.headers['x-frame-options'], undefined);
        assert.equal(response.headers['content-security-policy'], undefined);
        assert.equal(target.hits.includes('/api/health'), true);
        assert.equal(target.headers.at(-1)?.host, `127.0.0.1:${targetPort}`);
        assert.equal(target.headers.at(-1)?.origin, `http://127.0.0.1:${targetPort}`);

        await requestText(previewFrom, '/assets/app.js');
        await requestText(previewFrom, '/@vite/client');
        assert.equal(target.hits.includes('/assets/app.js'), true);
        assert.equal(target.hits.includes('/@vite/client'), true);
    } finally {
        await controller.close();
        await target.close();
    }
});

test('preview proxy rewrites redirects and rejects unexpected Host', async () => {
    const { targetPort, previewFrom } = await freePortPair();
    const target = await startTarget(targetPort);
    const controller = createPreviewOriginProxyController({ scanFrom: targetPort, scanCount: 1, previewFrom, managerPort: 24576 });
    try {
        await controller.ensureTarget(targetPort);
        const redirect = await requestText(previewFrom, '/redirect');
        assert.equal(redirect.headers.location, `http://127.0.0.1:${previewFrom}/next`);
        const denied = await requestText(previewFrom, '/', { host: `evil.test:${previewFrom}` });
        assert.equal(denied.status, 403);
        assert.match(denied.body, /Preview unavailable/);
    } finally {
        await controller.close();
        await target.close();
    }
});

test('preview proxy injects external-link escape policy into HTML responses', async () => {
    const { targetPort, previewFrom } = await freePortPair();
    const target = await startTarget(targetPort);
    const controller = createPreviewOriginProxyController({ scanFrom: targetPort, scanCount: 1, previewFrom, managerPort: 24576 });
    try {
        await controller.ensureTarget(targetPort);
        const response = await requestText(previewFrom, '/links');
        assert.equal(response.status, 200);
        assert.match(response.body, /data-jaw-preview-link-policy/);
        assert.match(response.body, /data-jaw-preview-drop-observer/);
        assert.match(response.body, /jaw-preview-dropped-files/);
        assert.match(response.body, /window\.open/);
        assert.match(response.body, /href="\/local"/);
        assert.equal(response.headers['content-security-policy'], undefined);
        assert.equal(response.headers['content-length'], undefined);
        assert.equal(target.headers.at(-1)?.['accept-encoding'], 'identity');
    } finally {
        await controller.close();
        await target.close();
    }
});

test('preview injection is idempotent for link policy and drop observer', () => {
    const html = '<!doctype html><html><head><title>x</title></head><body></body></html>';
    const once = injectPreviewLinkPolicy(html);
    const twice = injectPreviewLinkPolicy(once);
    assert.equal(twice, once);
    assert.equal((twice.match(/data-jaw-preview-link-policy/g) ?? []).length, 1);
    assert.equal((twice.match(/data-jaw-preview-drop-observer/g) ?? []).length, 1);
});

test('preview proxy accepts localhost alias for WSL-forwarded browser requests', async () => {
    const { targetPort, previewFrom } = await freePortPair();
    const target = await startTarget(targetPort);
    const controller = createPreviewOriginProxyController({ scanFrom: targetPort, scanCount: 1, previewFrom, managerPort: 24576 });
    try {
        await controller.ensureTarget(targetPort);
        const response = await requestText(previewFrom, '/api/health', {
            host: `localhost:${previewFrom}`,
            origin: `http://localhost:${previewFrom}`,
        });
        assert.equal(response.status, 200);
        assert.equal(response.body, 'ok');
        assert.equal(target.headers.at(-1)?.host, `127.0.0.1:${targetPort}`);
        assert.equal(target.headers.at(-1)?.origin, `http://127.0.0.1:${targetPort}`);
    } finally {
        await controller.close();
        await target.close();
    }
});

test('reconcile closes previously online targets and busy ports become unavailable', async () => {
    const targetPort = await freePort();
    const busyPreview = await freePort();
    const busy = http.createServer();
    await new Promise<void>(resolve => busy.listen(busyPreview, '127.0.0.1', () => resolve()));
    const controller = createPreviewOriginProxyController({ scanFrom: targetPort, scanCount: 1, previewFrom: busyPreview, managerPort: 24576 });
    try {
        await controller.reconcileOnlineTargets([targetPort]);
        assert.equal(controller.snapshot().instances[String(targetPort)]?.status, 'unavailable');
        assert.equal(controller.snapshot().instances[String(targetPort)]?.reason, 'EADDRINUSE');
        await new Promise<void>(resolve => busy.close(() => resolve()));
        await controller.ensureTarget(targetPort);
        assert.equal(controller.snapshot().instances[String(targetPort)]?.status, 'ready');
        await controller.reconcileOnlineTargets([]);
        assert.equal(controller.snapshot().instances[String(targetPort)]?.reason, 'target-offline');
    } finally {
        await controller.close();
        if (busy.listening) await new Promise<void>(resolve => busy.close(() => resolve()));
    }
});

test('websocket root path reaches target root path', async () => {
    const { targetPort, previewFrom } = await freePortPair();
    const target = await startTarget(targetPort);
    const controller = createPreviewOriginProxyController({ scanFrom: targetPort, scanCount: 1, previewFrom, managerPort: 24576 });
    try {
        await controller.ensureTarget(targetPort);
        await new Promise<void>((resolve, reject) => {
            const socket = net.connect(previewFrom, '127.0.0.1', () => {
                socket.write(`GET /ws HTTP/1.1\r\nHost: 127.0.0.1:${previewFrom}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n`);
            });
            socket.on('data', data => {
                if (data.toString().includes('101 Switching Protocols')) resolve();
            });
            socket.on('error', reject);
            socket.setTimeout(1000, () => reject(new Error('timeout')));
        });
        assert.equal(target.hits.includes('/ws'), true);
    } finally {
        await controller.close();
        await target.close();
    }
});

test('websocket proxy does not apply HTTP request timeout after upgrade', async () => {
    const { targetPort, previewFrom } = await freePortPair();
    const target = await startPersistentWebSocketTarget(targetPort);
    const controller = createPreviewOriginProxyController({
        scanFrom: targetPort,
        scanCount: 1,
        previewFrom,
        managerPort: 24576,
        requestTimeoutMs: 30,
    });
    let socket: net.Socket | null = null;
    try {
        await controller.ensureTarget(targetPort);
        await new Promise<void>((resolve, reject) => {
            socket = net.connect(previewFrom, '127.0.0.1', () => {
                socket?.write(`GET /ws HTTP/1.1\r\nHost: 127.0.0.1:${previewFrom}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n`);
            });
            socket.on('data', data => {
                if (data.toString().includes('101 Switching Protocols')) resolve();
            });
            socket.on('error', reject);
            socket.setTimeout(1000, () => reject(new Error('timeout')));
        });
        await new Promise(resolve => setTimeout(resolve, 80));
        assert.equal(socket?.destroyed, false);
        assert.equal(target.hits.includes('/ws'), true);
    } finally {
        socket?.destroy();
        await controller.close();
        await target.close();
    }
});

test('sse stream is not severed by the request deadline', async () => {
    const { targetPort, previewFrom } = await freePortPair();
    const responses = new Set<http.ServerResponse>();
    const server = http.createServer((_req, res) => {
        responses.add(res);
        res.writeHead(200, {
            'content-type': 'text/event-stream',
            'cache-control': 'no-cache',
        });
        res.write(': connected\n\n');
    });
    await new Promise<void>(resolve => server.listen(targetPort, '127.0.0.1', () => resolve()));
    const controller = createPreviewOriginProxyController({
        scanFrom: targetPort,
        scanCount: 1,
        previewFrom,
        managerPort: 24576,
        requestTimeoutMs: 30,
    });
    try {
        await controller.ensureTarget(targetPort);
        let ended = false;
        let received = '';
        await new Promise<void>((resolve, reject) => {
            const req = http.request({ hostname: '127.0.0.1', port: previewFrom, path: '/api/events' }, (res) => {
                assert.equal(res.statusCode, 200);
                res.setEncoding('utf8');
                res.on('data', chunk => {
                    received += chunk;
                    resolve();
                });
                res.on('end', () => { ended = true; });
            });
            req.on('error', reject);
            req.end();
        });
        await new Promise(resolve => setTimeout(resolve, 120));
        assert.equal(ended, false);
        assert.match(received, /: connected/);
    } finally {
        for (const res of responses) res.destroy();
        await controller.close();
        await new Promise<void>(resolve => server.close(() => resolve()));
    }
});

test('slow upstream response completes before end-to-end deadline', async () => {
    const { targetPort, previewFrom } = await freePortPair();
    const server = http.createServer((_req, res) => {
        setTimeout(() => {
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end('{"ok":true}');
        }, 120);
    });
    await new Promise<void>(resolve => server.listen(targetPort, '127.0.0.1', () => resolve()));
    const controller = createPreviewOriginProxyController({
        scanFrom: targetPort,
        scanCount: 1,
        previewFrom,
        managerPort: 24576,
        requestTimeoutMs: 500,
    });
    try {
        await controller.ensureTarget(targetPort);
        const response = await requestText(previewFrom, '/api/quota');
        assert.equal(response.status, 200);
        assert.equal(response.body, '{"ok":true}');
    } finally {
        await controller.close();
        await new Promise<void>(resolve => server.close(() => resolve()));
    }
});

test('diagnostic html is visible when upstream target closes and close is idempotent', async () => {
    const { targetPort, previewFrom } = await freePortPair();
    const target = await startTarget(targetPort);
    const controller = createPreviewOriginProxyController({ scanFrom: targetPort, scanCount: 1, previewFrom, managerPort: 24576 });
    await controller.ensureTarget(targetPort);
    await target.close();
    const response = await requestText(previewFrom, '/api/health');
    assert.equal(response.status, 502);
    assert.match(response.body, /Preview unavailable/);
    await controller.close();
    await controller.close();
    assert.equal(controller.snapshot().instances[String(targetPort)]?.reason, 'closed');
});
