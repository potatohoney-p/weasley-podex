import {
    extractElicitationSpecs,
    parseElicitationSpec,
    type NormalizedSpec,
} from '../../../src/shared/elicitation-spec.js';

export {
    extractElicitationSpecs,
    normalizeElicitationSpec,
    parseElicitationSpec,
} from '../../../src/shared/elicitation-spec.js';
export type {
    NormalizedOption,
    NormalizedQuestion,
    NormalizedSpec,
    QuestionType,
    VisibleWhen,
} from '../../../src/shared/elicitation-spec.js';

export interface MessageLike {
    role: string;
    content: string;
}

const STORAGE_PREFIX = 'jaw:elicitation:complete';
const STRUCTURED_RESPONSE_MARKER = '구조화 질문 응답:';

function stableStringify(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

function hashText(value: string): string {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
}

function currentScope(): string {
    const locationKey = typeof window === 'undefined' ? 'unknown' : `${window.location.origin}${window.location.pathname}`;
    let messageScope = 'default';
    try { messageScope = localStorage.getItem('PODEX_scope') || 'default'; } catch { /* storage unavailable */ }
    return hashText(`${locationKey}::${messageScope}`);
}

export function specHash(spec: NormalizedSpec): string {
    return hashText(stableStringify(spec));
}

export function completionStorageKey(input: { turnIndex: number; blockIndex: number; spec: NormalizedSpec }): string {
    return `${STORAGE_PREFIX}:${currentScope()}:${input.turnIndex}:${input.blockIndex}:${specHash(input.spec)}`;
}

export function completionKeyForBlock(block: HTMLElement, spec: NormalizedSpec): string | null {
    const msg = block.closest<HTMLElement>('.msg');
    const rawTurnIndex = msg?.dataset['turnIndex'] || '';
    const turnIndex = Number(rawTurnIndex);
    if (!Number.isFinite(turnIndex) || turnIndex < 0) return null;
    const owner = block.closest<HTMLElement>('.msg-content') || msg;
    const siblings = owner
        ? Array.from(owner.querySelectorAll<HTMLElement>('.elicitation-pending, .elicitation-block'))
        : [block];
    const blockIndex = Math.max(0, siblings.indexOf(block));
    return completionStorageKey({ turnIndex, blockIndex, spec });
}

export function isElicitationCompleted(key: string | null): boolean {
    if (!key) return false;
    try { return localStorage.getItem(key) === '1'; } catch { return false; }
}

export function markElicitationCompleted(key: string | null): void {
    if (!key) return;
    try { localStorage.setItem(key, '1'); } catch { /* storage unavailable */ }
}

function isAssistantRole(role: string): boolean {
    return role === 'assistant' || role === 'agent';
}

function isUserStructuredResponse(message: MessageLike | undefined): boolean {
    return message?.role === 'user' && message.content.includes(STRUCTURED_RESPONSE_MARKER);
}

function responseMatchesSpec(response: string, spec: NormalizedSpec): boolean {
    return spec.questions.some(question => response.includes(question.question));
}

export function seedCompletedElicitationsFromMessages(messages: MessageLike[]): void {
    messages.forEach((message, turnIndex) => {
        if (!isAssistantRole(message.role)) return;
        const next = messages[turnIndex + 1];
        if (!isUserStructuredResponse(next)) return;
        extractElicitationSpecs(message.content).forEach((rawSpec, blockIndex) => {
            const spec = parseElicitationSpec(rawSpec);
            if (!spec || !responseMatchesSpec(next.content, spec)) return;
            markElicitationCompleted(completionStorageKey({ turnIndex, blockIndex, spec }));
        });
    });
}

