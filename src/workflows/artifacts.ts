import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { JAW_HOME } from '../core/config.js';
import type {
    WorkflowArtifact,
    WorkflowArtifactKind,
    WorkflowArtifactStorage,
    UnknownCommandRecovery,
} from '../cli/types.js';

const ARTIFACT_ROOT = path.join(JAW_HOME, 'artifacts', 'workflows');
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function hashText(value: string): string {
    return crypto.createHash('sha256').update(value || 'default').digest('hex').slice(0, 10);
}

function slugSegment(value: string): string {
    const normalized = String(value || 'default')
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48);
    return normalized || 'default';
}

function assertSafeSegment(value: string, label: string): string {
    const raw = String(value || '');
    if (path.isAbsolute(raw) || raw.includes('..') || raw.includes('/') || raw.includes('\\')) {
        throw new Error(`Invalid workflow artifact ${label}`);
    }
    const segment = slugSegment(value);
    if (segment === '..' || segment.includes('/')) {
        throw new Error(`Invalid workflow artifact ${label}`);
    }
    return segment;
}

function assertInsideRoot(candidate: string): string {
    const root = path.resolve(ARTIFACT_ROOT);
    const resolved = path.resolve(candidate);
    if (resolved !== root && !resolved.startsWith(root + path.sep)) {
        throw new Error('Workflow artifact path escaped JAW_HOME artifact root');
    }
    return resolved;
}

function dateStamp(now = new Date()): string {
    return now.toISOString().slice(0, 10);
}

export function getWorkflowArtifactsRoot(): string {
    return ARTIFACT_ROOT;
}

export function projectKeyFromPath(input: unknown): string {
    const raw = String(input || 'default').trim() || 'default';
    return `${slugSegment(path.basename(raw))}-${hashText(raw)}`;
}

export function projectKeyFromSettings(settings: unknown): string {
    const s = settings && typeof settings === 'object' ? settings as Record<string, unknown> : {};
    const dirs = Array.isArray(s["projectDirs"]) ? s["projectDirs"] : [];
    const firstProject = dirs.find((d): d is string => typeof d === 'string' && d.trim().length > 0);
    return projectKeyFromPath(firstProject || s["workingDir"] || 'default');
}

export function createWorkflowArtifactId(kind: WorkflowArtifactKind, now = new Date()): string {
    const ts = now.toISOString().replace(/[^0-9]/g, '').slice(0, 14);
    const rand = crypto.randomUUID().slice(0, 8);
    return assertSafeSegment(`${ts}-${kind}-${rand}`, 'id');
}

export function resolveWorkflowArtifactPath(
    projectKey: string,
    artifactId: string,
    day = dateStamp(),
): string {
    const safeProject = assertSafeSegment(projectKey, 'project key');
    const safeDay = DATE_RE.test(day) ? day : dateStamp();
    const safeId = assertSafeSegment(artifactId, 'id');
    return assertInsideRoot(path.join(ARTIFACT_ROOT, safeProject, safeDay, `${safeId}.json`));
}

export function createWorkflowStorage(projectKey: string): WorkflowArtifactStorage {
    return {
        mode: 'jaw-home-cache',
        projectKey: assertSafeSegment(projectKey, 'project key'),
        retentionDays: 30,
    };
}

export function saveWorkflowArtifact(artifact: WorkflowArtifact, settings?: unknown): WorkflowArtifact {
    if (artifact.storage.mode !== 'jaw-home-cache') return artifact;
    const projectKey = artifact.storage.projectKey || projectKeyFromSettings(settings);
    const id = artifact.id || createWorkflowArtifactId(artifact.kind);
    const pathOnDisk = resolveWorkflowArtifactPath(projectKey, id, dateStamp());
    const next: WorkflowArtifact = {
        ...artifact,
        id,
        lifetime: 'local-cache',
        durable: false,
        authoritative: false,
        storage: {
            ...artifact.storage,
            mode: 'jaw-home-cache',
            projectKey,
            path: pathOnDisk,
            retentionDays: artifact.storage.retentionDays ?? 30,
        },
    };
    try {
        fs.mkdirSync(path.dirname(pathOnDisk), { recursive: true });
        fs.writeFileSync(pathOnDisk, JSON.stringify(next, null, 2));
        next.storage.writeStatus = 'saved';
    } catch (err: unknown) {
        next.storage.writeStatus = 'failed';
        next.storage.writeError = (err as Error).message;
        if (process.env["DEBUG"]) console.warn('[workflow-artifact:save]', (err as Error).message);
    }
    return next;
}

export function buildUnknownCommandArtifact(
    recovery: UnknownCommandRecovery,
    locale = 'ko',
    settings?: unknown,
): WorkflowArtifact {
    const projectKey = projectKeyFromSettings(settings);
    return {
        id: createWorkflowArtifactId('unknownCommandRecovery'),
        kind: 'unknownCommandRecovery',
        version: 1,
        title: locale === 'ko' ? '알 수 없는 커맨드 복구' : 'Unknown command recovery',
        sourcePrompt: recovery.originalText,
        summary: recovery.commandName,
        locale,
        createdAt: new Date().toISOString(),
        lifetime: 'local-cache',
        durable: false,
        authoritative: false,
        storage: createWorkflowStorage(projectKey),
        sections: [
            {
                id: 'error',
                title: locale === 'ko' ? '오류' : 'Error',
                body: `/${recovery.commandName}`,
                format: 'plain',
                required: true,
            },
            {
                id: 'original-prompt',
                title: locale === 'ko' ? '입력했던 내용' : 'Original prompt',
                body: recovery.originalText,
                format: 'plain',
                required: true,
            },
            {
                id: 'suggestions',
                title: locale === 'ko' ? '추천 커맨드' : 'Suggested commands',
                body: recovery.suggestedCommands.length ? recovery.suggestedCommands.join('\n') : '/help',
                format: 'plain',
            },
        ],
        suggestedNextActions: [
            { id: 'reinsert', labelKey: 'cmd.artifact.action.reinsert', kind: 'reinsert' },
            { id: 'copy', labelKey: 'cmd.artifact.action.copy', kind: 'copy' },
            { id: 'send-as-chat', labelKey: 'cmd.artifact.action.sendAsChat', kind: 'send-as-chat' },
        ],
    };
}
