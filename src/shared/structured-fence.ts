export type StructuredFenceStatus = 'absent' | 'complete' | 'incomplete';

export interface StructuredFenceScan {
    status: StructuredFenceStatus;
    completeCount: number;
    incompleteCount: number;
    langs: string[];
}

const DEFAULT_STRUCTURED_FENCE_LANGS = [
    'elicitation',
    'choice-buttons',
    'search-results',
    'compose-block',
    'dataframe',
    'chart-json',
];
const FENCE_OPEN_RE = /^ {0,3}(`{3,}|~{3,})([A-Za-z0-9_-]+)?[^\n]*$/;

function normalizeLangs(langs: readonly string[]): Set<string> {
    return new Set(langs.map(lang => lang.trim().toLowerCase()).filter(Boolean));
}

function isClosingFence(line: string, marker: string): boolean {
    const fenceChar = marker[0];
    const minLength = marker.length;
    const closeRe = new RegExp(`^ {0,3}\\${fenceChar}{${minLength},}[ \\t]*$`);
    return closeRe.test(line);
}

export function scanStructuredFence(
    text: string,
    langs: readonly string[] = DEFAULT_STRUCTURED_FENCE_LANGS,
): StructuredFenceScan {
    const wanted = normalizeLangs(langs);
    const seen = new Set<string>();
    let completeCount = 0;
    let incompleteCount = 0;
    const lines = text.split(/\r?\n/);

    for (let i = 0; i < lines.length; i += 1) {
        const match = lines[i]!.match(FENCE_OPEN_RE);
        if (!match) continue;
        const marker = match[1]!;
        const lang = (match[2] || '').trim().toLowerCase();
        if (!wanted.has(lang)) continue;
        seen.add(lang);

        let closed = false;
        for (let j = i + 1; j < lines.length; j += 1) {
            if (isClosingFence(lines[j]!, marker)) {
                completeCount += 1;
                closed = true;
                i = j;
                break;
            }
        }
        if (!closed) {
            incompleteCount += 1;
            break;
        }
    }

    const status: StructuredFenceStatus = incompleteCount > 0
        ? 'incomplete'
        : completeCount > 0
            ? 'complete'
            : 'absent';

    return {
        status,
        completeCount,
        incompleteCount,
        langs: [...seen],
    };
}

export function hasIncompleteStructuredFence(text: string): boolean {
    return scanStructuredFence(text).status === 'incomplete';
}
