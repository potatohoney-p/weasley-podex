export type QuestionType = 'single_select' | 'multi_select' | 'rank_priorities';
export type VisibleWhen = Record<string, string[]>;

interface RawOption {
    id?: unknown;
    value?: unknown;
    label?: unknown;
    text?: unknown;
    description?: unknown;
    submitText?: unknown;
}

interface RawQuestion {
    id?: unknown;
    type?: unknown;
    question?: unknown;
    title?: unknown;
    prompt?: unknown;
    options?: unknown;
    visibleWhen?: unknown;
}

export interface NormalizedOption {
    id: string;
    value: string;
    label: string;
    description: string;
    submitText: string;
}

export interface NormalizedQuestion {
    id: string;
    type: QuestionType;
    question: string;
    options: NormalizedOption[];
    visibleWhen: VisibleWhen;
}

export interface NormalizedSpec {
    questions: NormalizedQuestion[];
}

export interface PlainElicitationRenderOptions {
    intro?: string;
    includeDescriptions?: boolean;
    multiQuestionPrefix?: boolean;
}

function asString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function parseSpec(raw: string): unknown {
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function normalizeType(value: unknown): QuestionType {
    const raw = asString(value);
    if (raw === 'multi_select' || raw === 'multi' || raw === 'checkbox') return 'multi_select';
    if (raw === 'rank_priorities' || raw === 'rank' || raw === 'ranking') return 'rank_priorities';
    return 'single_select';
}

function normalizeOptions(rawOptions: unknown): NormalizedOption[] {
    if (!Array.isArray(rawOptions)) return [];
    return rawOptions
        .map((option, index): NormalizedOption | null => {
            if (typeof option === 'string') {
                const label = option.trim();
                if (!label) return null;
                return { id: `option_${index + 1}`, value: label, label, description: '', submitText: '' };
            }
            if (!option || typeof option !== 'object') return null;
            const raw = option as RawOption;
            const label = asString(raw.label) || asString(raw.text) || asString(raw.value) || asString(raw.id);
            if (!label) return null;
            const value = asString(raw.value) || label;
            return {
                id: asString(raw.id) || value || `option_${index + 1}`,
                value,
                label,
                description: asString(raw.description),
                submitText: asString(raw.submitText),
            };
        })
        .filter((option): option is NormalizedOption => Boolean(option));
}

function normalizeVisibleWhen(value: unknown): VisibleWhen {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const visibleWhen: VisibleWhen = {};
    for (const [rawKey, rawAllowed] of Object.entries(value as Record<string, unknown>)) {
        const key = rawKey.trim();
        if (!key) continue;
        const allowed = Array.isArray(rawAllowed)
            ? rawAllowed.map(asString).filter(Boolean)
            : [asString(rawAllowed)].filter(Boolean);
        if (allowed.length > 0) visibleWhen[key] = allowed;
    }
    return visibleWhen;
}

function normalizeQuestion(rawQuestion: unknown, index: number): NormalizedQuestion | null {
    if (!rawQuestion || typeof rawQuestion !== 'object') return null;
    const raw = rawQuestion as RawQuestion;
    const question = asString(raw.question) || asString(raw.title) || asString(raw.prompt);
    if (!question) return null;
    return {
        id: asString(raw.id) || `q${index + 1}`,
        type: normalizeType(raw.type),
        question,
        options: normalizeOptions(raw.options),
        visibleWhen: normalizeVisibleWhen(raw.visibleWhen),
    };
}

export function normalizeElicitationSpec(rawSpec: unknown): NormalizedSpec | null {
    if (!rawSpec || typeof rawSpec !== 'object') return null;
    const spec = rawSpec as { questions?: unknown; question?: unknown; options?: unknown; type?: unknown };
    const questions = Array.isArray(spec.questions)
        ? spec.questions
        : [{ question: spec.question, options: spec.options, type: spec.type }];
    const normalized = questions
        .map((question, index) => normalizeQuestion(question, index))
        .filter((question): question is NormalizedQuestion => Boolean(question));
    return normalized.length > 0 ? { questions: normalized } : null;
}

export function parseElicitationSpec(raw: string): NormalizedSpec | null {
    return normalizeElicitationSpec(parseSpec(raw));
}

export function extractElicitationSpecs(content: string): string[] {
    const specs: string[] = [];
    const re = /^ {0,3}```(?:elicitation|choice-buttons)[^\n]*\n([\s\S]*?)^ {0,3}```/gm;
    for (const match of content.matchAll(re)) {
        const raw = match[1]?.trim();
        if (raw) specs.push(raw);
    }
    return specs;
}

export function renderPlainElicitationSpec(
    spec: NormalizedSpec,
    options: PlainElicitationRenderOptions = {},
): string {
    const lines: string[] = [];
    if (options.intro) lines.push(options.intro, '');
    spec.questions.forEach((question, questionIndex) => {
        const header = options.multiQuestionPrefix || spec.questions.length > 1
            ? `Q${questionIndex + 1}. ${question.question}`
            : question.question;
        lines.push(header);
        question.options.forEach((option, optionIndex) => {
            const suffix = options.includeDescriptions && option.description
                ? ` — ${option.description}`
                : '';
            lines.push(`${optionIndex + 1}. ${option.label}${suffix}`);
        });
        if (questionIndex < spec.questions.length - 1) lines.push('');
    });
    return lines.join('\n').trimEnd();
}
