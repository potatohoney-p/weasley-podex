import type { NoteGraphEdge, NoteGraphNode, NoteMetadata } from '../../types';
import type { NotesVaultIndexSnapshot } from '../notes-types';
import type { NotesGraphGroup, NotesGraphSettings } from './notes-graph-settings';

export type NotesGraphRenderNode = NoteGraphNode & {
    degree: number;
    groupColor?: string;
    groupLabel?: string;
    searchMatch: boolean;
};

export type NotesGraphRenderEdge = NoteGraphEdge & {
    virtual?: boolean;
};

export type NotesGraphRenderData = {
    nodes: NotesGraphRenderNode[];
    edges: NotesGraphRenderEdge[];
    noteCount: number;
    linkCount: number;
    missingCount: number;
    tagCount: number;
    hiddenCount: number;
};

type GraphShape = { nodes: NoteGraphNode[]; edges: NoteGraphEdge[] };

const NODE_KIND_ORDER: Record<NoteGraphNode['kind'], number> = {
    note: 0,
    tag: 1,
    missing: 2,
    ambiguous: 3,
    attachment: 4,
};

function normalizeTag(tag: string): string {
    return tag.trim().replace(/^#/, '').toLowerCase();
}

function tagNodeId(tag: string): string {
    return `tag:${normalizeTag(tag)}`;
}

function nodeSearchFields(node: NoteGraphNode, metadata: NoteMetadata | undefined): string[] {
    const fields = [node.id, node.title, node.path ?? ''];
    if (metadata) fields.push(metadata.title, metadata.path, ...metadata.aliases, ...metadata.tags);
    return fields.filter(Boolean).map(field => field.toLowerCase());
}

function tokenMatchesNode(token: string, node: NoteGraphNode, metadata: NoteMetadata | undefined): boolean {
    const lower = token.toLowerCase();
    if (lower.startsWith('kind:')) return node.kind === lower.slice(5);
    if (lower.startsWith('path:')) return (node.path ?? node.id).toLowerCase().includes(lower.slice(5));
    if (lower.startsWith('tag:')) {
        const tag = normalizeTag(lower.slice(4));
        if (!tag) return true;
        if (node.kind === 'tag') return normalizeTag(node.title).includes(tag) || node.id.includes(tag);
        return Boolean(metadata?.tags.some(noteTag => normalizeTag(noteTag).includes(tag)));
    }
    return nodeSearchFields(node, metadata).some(field => field.includes(lower));
}

function matchesQuery(query: string, node: NoteGraphNode, metadata: NoteMetadata | undefined): boolean {
    const tokens = query.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return true;
    return tokens.every(token => tokenMatchesNode(token, node, metadata));
}

function matchingGroup(
    node: NoteGraphNode,
    metadata: NoteMetadata | undefined,
    settings: NotesGraphSettings,
): NotesGraphGroup | undefined {
    if (settings.groupMode === 'off') return undefined;
    return settings.groups.find(group => group.enabled && matchesQuery(group.query, node, metadata));
}

function buildWorkingGraph(snapshot: NotesVaultIndexSnapshot, settings: NotesGraphSettings): GraphShape {
    const nodes = new Map<string, NoteGraphNode>();
    for (const node of snapshot.graph.nodes) nodes.set(node.id, { ...node });
    for (const note of snapshot.notes) {
        if (!nodes.has(note.path)) nodes.set(note.path, { id: note.path, title: note.title, kind: 'note', path: note.path });
    }
    const edges: NoteGraphEdge[] = snapshot.graph.edges.map(edge => ({ ...edge }));
    // The server-owned vault index is the authority for wikilink connectivity,
    // including missing/ambiguous nodes. The client only adds virtual tag edges.
    if (settings.showTags) {
        for (const note of snapshot.notes) {
            for (const rawTag of note.tags) {
                const tag = normalizeTag(rawTag);
                if (!tag) continue;
                const id = tagNodeId(tag);
                if (!nodes.has(id)) nodes.set(id, { id, title: `#${tag}`, kind: 'tag' });
                edges.push({ source: note.path, target: id, raw: `#${tag}`, status: 'resolved', resolvedPath: note.path });
            }
        }
    }
    return { nodes: [...nodes.values()], edges };
}

function degreeByNode(edges: NoteGraphEdge[]): Map<string, number> {
    const degree = new Map<string, number>();
    for (const edge of edges) {
        degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
        degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
    }
    return degree;
}

function focusedNodeIds(edges: NoteGraphEdge[], selectedPath: string, maxDepth: number): Set<string> {
    const adjacency = new Map<string, Set<string>>();
    for (const edge of edges) {
        if (!adjacency.has(edge.source)) adjacency.set(edge.source, new Set());
        if (!adjacency.has(edge.target)) adjacency.set(edge.target, new Set());
        adjacency.get(edge.source)?.add(edge.target);
        adjacency.get(edge.target)?.add(edge.source);
    }
    const visible = new Set<string>([selectedPath]);
    let frontier = new Set<string>([selectedPath]);
    for (let depth = 0; depth < maxDepth; depth += 1) {
        const next = new Set<string>();
        for (const nodeId of frontier) {
            for (const neighbor of adjacency.get(nodeId) ?? []) {
                if (visible.has(neighbor)) continue;
                visible.add(neighbor);
                next.add(neighbor);
            }
        }
        frontier = next;
        if (frontier.size === 0) break;
    }
    return visible;
}

function compareNodes(a: NotesGraphRenderNode, b: NotesGraphRenderNode): number {
    return NODE_KIND_ORDER[a.kind] - NODE_KIND_ORDER[b.kind] || a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
}

export function deriveNotesGraphData(
    snapshot: NotesVaultIndexSnapshot | null,
    settings: NotesGraphSettings,
    selectedPath: string | null,
): NotesGraphRenderData {
    if (!snapshot) return { nodes: [], edges: [], noteCount: 0, linkCount: 0, missingCount: 0, tagCount: 0, hiddenCount: 0 };
    const metadataByPath = new Map(snapshot.notes.map(note => [note.path, note]));
    const graph = buildWorkingGraph(snapshot, settings);
    let candidateNodes = graph.nodes.filter(node => {
        if (settings.existingFilesOnly && (node.kind === 'missing' || node.kind === 'ambiguous')) return false;
        if (!settings.showTags && node.kind === 'tag') return false;
        if (!settings.showAttachments && node.kind === 'attachment') return false;
        return matchesQuery(settings.query, node, metadataByPath.get(node.path ?? node.id));
    });
    let candidateIds = new Set(candidateNodes.map(node => node.id));
    let candidateEdges = graph.edges.filter(edge => candidateIds.has(edge.source) && candidateIds.has(edge.target));
    if (!settings.showOrphans) {
        const degree = degreeByNode(candidateEdges);
        candidateNodes = candidateNodes.filter(node => node.id === selectedPath || (degree.get(node.id) ?? 0) > 0 || node.kind !== 'note');
        candidateIds = new Set(candidateNodes.map(node => node.id));
        candidateEdges = candidateEdges.filter(edge => candidateIds.has(edge.source) && candidateIds.has(edge.target));
    }
    if (settings.focusSelected && selectedPath && candidateIds.has(selectedPath)) {
        const focusedIds = focusedNodeIds(candidateEdges, selectedPath, settings.focusDepth);
        candidateNodes = candidateNodes.filter(node => focusedIds.has(node.id));
        candidateIds = new Set(candidateNodes.map(node => node.id));
        candidateEdges = candidateEdges.filter(edge => candidateIds.has(edge.source) && candidateIds.has(edge.target));
    }
    const degree = degreeByNode(candidateEdges);
    const renderNodes: NotesGraphRenderNode[] = candidateNodes.map(node => {
        const metadata = metadataByPath.get(node.path ?? node.id);
        const group = matchingGroup(node, metadata, settings);
        return {
            ...node,
            degree: degree.get(node.id) ?? 0,
            ...(group ? { groupColor: group.color, groupLabel: group.label } : {}),
            searchMatch: matchesQuery(settings.query, node, metadata),
        };
    }).sort(compareNodes);
    const visibleIds = new Set(renderNodes.map(node => node.id));
    const edges = candidateEdges
        .filter(edge => visibleIds.has(edge.source) && visibleIds.has(edge.target))
        .map(edge => ({ ...edge, virtual: edge.target.startsWith('tag:') || edge.source.startsWith('tag:') }))
        .sort((a, b) => a.source.localeCompare(b.source) || a.target.localeCompare(b.target) || a.raw.localeCompare(b.raw));
    return {
        nodes: renderNodes,
        edges,
        noteCount: renderNodes.filter(node => node.kind === 'note').length,
        linkCount: edges.filter(edge => !edge.virtual).length,
        missingCount: renderNodes.filter(node => node.kind === 'missing' || node.kind === 'ambiguous').length,
        tagCount: renderNodes.filter(node => node.kind === 'tag').length,
        hiddenCount: graph.nodes.length - renderNodes.length,
    };
}
