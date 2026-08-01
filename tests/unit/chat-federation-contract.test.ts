import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');

describe('L2 chat federation contract', () => {
    const federationSrc = fs.readFileSync(path.join(ROOT, 'src/manager/memory/chat-federation.ts'), 'utf8');
    const typesSrc = fs.readFileSync(path.join(ROOT, 'src/manager/memory/types.ts'), 'utf8');
    const routeSrc = fs.readFileSync(path.join(ROOT, 'src/manager/routes/dashboard-memory.ts'), 'utf8');
    const cliSrc = fs.readFileSync(path.join(ROOT, 'bin/commands/dashboard-chat.ts'), 'utf8');
    const dashboardSrc = fs.readFileSync(path.join(ROOT, 'bin/commands/dashboard.ts'), 'utf8');

    test('chat-federation exports searchChatFederated', () => {
        assert.match(federationSrc, /export function searchChatFederated/);
    });

    test('ChatSearchHit type includes instanceId and match_field', () => {
        assert.match(typesSrc, /export interface ChatSearchHit/);
        assert.match(typesSrc, /instanceId: string/);
        assert.match(typesSrc, /match_field: 'content' \| 'tool_log'/);
    });

    test('federation route is mounted at /chat/search', () => {
        assert.match(routeSrc, /router\.get\('\/chat\/search'/);
        assert.match(routeSrc, /searchChatFederated/);
    });

    test('CLI command handles search subcommand', () => {
        assert.match(cliSrc, /export async function handleDashboardChat/);
        assert.match(cliSrc, /case 'search'/);
        assert.match(cliSrc, /\/chat\/search/);
    });

    test('dashboard.ts routes chat subcommand', () => {
        assert.match(dashboardSrc, /case 'chat'/);
        assert.match(dashboardSrc, /handleDashboardChat/);
    });

    test('federation probes schema before querying', () => {
        assert.match(federationSrc, /function probeSchema/);
        assert.match(federationSrc, /pragma.*table_info.*messages/);
    });

    test('federation handles native module mismatch', () => {
        assert.match(federationSrc, /NODE_MODULE_VERSION/);
        assert.match(federationSrc, /native_module_mismatch/);
    });

    test('InstanceMemoryRef includes chatDbPath and hasChatDb', () => {
        assert.match(typesSrc, /chatDbPath: string/);
        assert.match(typesSrc, /hasChatDb: boolean/);
    });
});

describe('Memory→chat context jump contract', () => {
    const jawMemoryRouteSrc = fs.readFileSync(path.join(ROOT, 'src/routes/jaw-memory.ts'), 'utf8');
    const memorySrc = fs.readFileSync(path.join(ROOT, 'src/memory/memory.ts'), 'utf8');
    const memoryCliSrc = fs.readFileSync(path.join(ROOT, 'bin/commands/memory.ts'), 'utf8');
    const dbSrc = fs.readFileSync(path.join(ROOT, 'src/core/db.ts'), 'utf8');

    test('jaw-memory route has /context endpoint', () => {
        assert.match(jawMemoryRouteSrc, /\/api\/jaw-memory\/context/);
        assert.match(jawMemoryRouteSrc, /searchMessagesByTimeWindow/);
    });

    test('db.ts exports cross-session time-window search', () => {
        assert.match(dbSrc, /export const searchMessagesByTimeWindow/);
        assert.match(dbSrc, /BETWEEN datetime\(\$center/);
        assert.match(dbSrc, /window_hours/);
    });

    test('memory CLI has context subcommand', () => {
        assert.match(memoryCliSrc, /case 'context'/);
        assert.match(memoryCliSrc, /\/context\?/);
    });

    test('memory save injects created_at for new files with frontmatter', () => {
        assert.match(memorySrc, /function injectCreatedAt/);
        assert.match(memorySrc, /created_at:/);
        assert.match(memorySrc, /const isNew = !fs\.existsSync/);
    });
});
