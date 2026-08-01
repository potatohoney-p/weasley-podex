import { WebSocketServer } from 'ws';
import type { Server } from 'node:http';
import type { WatcherEvent, NotesWatcher } from './watcher.js';
import { randomBytes } from 'node:crypto';

export type NoteWsServerOptions = {
    server: Server;
    watcher: NotesWatcher;
    path?: string;
};

const TOKEN_TTL_MS = 60_000;

type PendingToken = {
    token: string;
    expiresAt: number;
};

export class NoteWsServer {
    private wss: WebSocketServer;
    private pendingTokens: PendingToken[] = [];

    constructor(options: NoteWsServerOptions) {
        const wsPath = options.path ?? '/api/dashboard/notes/ws';

        this.wss = new WebSocketServer({ noServer: true });

        options.server.on('upgrade', (request, socket, head) => {
            const url = new URL(request.url ?? '', `http://${request.headers.host}`);
            if (url.pathname !== wsPath) return;

            const addr = request.socket.remoteAddress ?? '';
            const isLoopback = addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';

            if (!isLoopback) {
                const token = url.searchParams.get('token');
                if (!token || !this.consumeToken(token)) {
                    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
                    socket.destroy();
                    return;
                }
            }

            this.wss.handleUpgrade(request, socket, head, (ws) => {
                this.wss.emit('connection', ws, request);
            });
        });

        options.watcher.onEvent((event) => this.broadcast(event));
    }

    issueToken(): string {
        this.pruneExpiredTokens();
        const token = randomBytes(32).toString('hex');
        this.pendingTokens.push({ token, expiresAt: Date.now() + TOKEN_TTL_MS });
        return token;
    }

    private consumeToken(token: string): boolean {
        this.pruneExpiredTokens();
        const index = this.pendingTokens.findIndex(t => t.token === token);
        if (index === -1) return false;
        this.pendingTokens.splice(index, 1);
        return true;
    }

    private pruneExpiredTokens(): void {
        const now = Date.now();
        this.pendingTokens = this.pendingTokens.filter(t => t.expiresAt > now);
    }

    broadcast(event: WatcherEvent): void {
        const message = JSON.stringify(event);
        for (const client of this.wss.clients) {
            if (client.readyState === 1) {
                client.send(message);
            }
        }
    }

    close(): void {
        for (const client of this.wss.clients) client.close();
        this.wss.close();
    }
}
