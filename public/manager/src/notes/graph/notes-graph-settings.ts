import type {
    DashboardNotesGraphGroup,
    DashboardNotesGraphSection,
    DashboardNotesGraphSettings,
} from '../../types';

export type NotesGraphGroup = DashboardNotesGraphGroup;
export type NotesGraphSection = DashboardNotesGraphSection;
export type NotesGraphSettings = DashboardNotesGraphSettings;

export const NOTES_GRAPH_SECTIONS: NotesGraphSection[] = ['filters', 'display', 'forces', 'groups'];
export const NOTES_GRAPH_GROUP_COLORS = ['#7c9cff', '#3fb950', '#f2cc60', '#ff7b72', '#d2a8ff', '#56d4dd'];

export const DEFAULT_NOTES_GRAPH_SETTINGS: NotesGraphSettings = {
    version: 1,
    panelOpen: true,
    collapsedSections: {},
    query: '',
    existingFilesOnly: false,
    showOrphans: true,
    showTags: true,
    showAttachments: false,
    focusSelected: false,
    focusDepth: 1,
    groupMode: 'query',
    groups: [],
    nodeSize: 1,
    linkDistance: 92,
    chargeStrength: -180,
    labelDensity: 0.6,
    showArrows: false,
    animate: true,
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
}

function readText(value: unknown, fallback = '', max = 240): string {
    return typeof value === 'string' ? value.trim().slice(0, max) : fallback;
}

function readColor(value: unknown, fallback: string): string {
    if (typeof value !== 'string') return fallback;
    const trimmed = value.trim();
    return /^#[0-9a-f]{6}$/i.test(trimmed) ? trimmed : fallback;
}

export function cloneNotesGraphSettings(settings: NotesGraphSettings): NotesGraphSettings {
    return {
        ...settings,
        collapsedSections: { ...settings.collapsedSections },
        groups: settings.groups.map(group => ({ ...group })),
    };
}

export function normalizeNotesGraphSettings(value: unknown): NotesGraphSettings {
    const input = isRecord(value) ? value : {};
    const fallback = DEFAULT_NOTES_GRAPH_SETTINGS;
    const collapsedInput = isRecord(input['collapsedSections']) ? input['collapsedSections'] : {};
    const collapsedSections: NotesGraphSettings['collapsedSections'] = {};
    for (const section of NOTES_GRAPH_SECTIONS) {
        if (typeof collapsedInput[section] === 'boolean') collapsedSections[section] = collapsedInput[section];
    }
    const groupsInput = Array.isArray(input['groups']) ? input['groups'] : [];
    const groups = groupsInput.flatMap((candidate, index): NotesGraphGroup[] => {
        if (!isRecord(candidate)) return [];
        const query = readText(candidate['query']);
        if (!query) return [];
        return [{
            id: readText(candidate['id'], `group-${index + 1}`, 80),
            label: readText(candidate['label'], `Group ${index + 1}`, 80),
            query,
            color: readColor(candidate['color'], NOTES_GRAPH_GROUP_COLORS[index % NOTES_GRAPH_GROUP_COLORS.length] ?? '#7c9cff'),
            enabled: typeof candidate['enabled'] === 'boolean' ? candidate['enabled'] : true,
        }];
    }).slice(0, 20);
    return {
        version: 1,
        panelOpen: typeof input['panelOpen'] === 'boolean' ? input['panelOpen'] : fallback.panelOpen,
        collapsedSections,
        query: readText(input['query'], fallback.query),
        existingFilesOnly: typeof input['existingFilesOnly'] === 'boolean' ? input['existingFilesOnly'] : fallback.existingFilesOnly,
        showOrphans: typeof input['showOrphans'] === 'boolean' ? input['showOrphans'] : fallback.showOrphans,
        showTags: typeof input['showTags'] === 'boolean' ? input['showTags'] : fallback.showTags,
        showAttachments: typeof input['showAttachments'] === 'boolean' ? input['showAttachments'] : fallback.showAttachments,
        focusSelected: typeof input['focusSelected'] === 'boolean' ? input['focusSelected'] : fallback.focusSelected,
        focusDepth: clampInt(input['focusDepth'], fallback.focusDepth, 1, 4),
        groupMode: input['groupMode'] === 'off' || input['groupMode'] === 'query' ? input['groupMode'] : fallback.groupMode,
        groups,
        nodeSize: clampNumber(input['nodeSize'], fallback.nodeSize, 0.6, 2),
        linkDistance: clampInt(input['linkDistance'], fallback.linkDistance, 40, 240),
        chargeStrength: clampInt(input['chargeStrength'], fallback.chargeStrength, -800, -20),
        labelDensity: clampNumber(input['labelDensity'], fallback.labelDensity, 0, 1),
        showArrows: typeof input['showArrows'] === 'boolean' ? input['showArrows'] : fallback.showArrows,
        animate: typeof input['animate'] === 'boolean' ? input['animate'] : fallback.animate,
    };
}

export function createNotesGraphGroup(index: number, query: string): NotesGraphGroup {
    const color = NOTES_GRAPH_GROUP_COLORS[index % NOTES_GRAPH_GROUP_COLORS.length] ?? '#7c9cff';
    return {
        id: `graph-group-${Date.now().toString(36)}-${index.toString(36)}`,
        label: `Group ${index + 1}`,
        query: query.trim() || 'tag:',
        color,
        enabled: true,
    };
}
