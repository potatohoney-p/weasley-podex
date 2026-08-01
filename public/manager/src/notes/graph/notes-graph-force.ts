import type { NotesGraphRenderNode } from './notes-graph-filter';
import type { NotesGraphSettings } from './notes-graph-settings';

export type NotesGraphForceConfig = {
    nodeSize: number;
    linkDistance: number;
    chargeStrength: number;
    labelDensity: number;
    showArrows: boolean;
    animate: boolean;
};

export function graphForceConfigFromSettings(settings: NotesGraphSettings): NotesGraphForceConfig {
    return {
        nodeSize: settings.nodeSize,
        linkDistance: settings.linkDistance,
        chargeStrength: settings.chargeStrength,
        labelDensity: settings.labelDensity,
        showArrows: settings.showArrows,
        animate: settings.animate,
    };
}

export function radiusForNode(node: NotesGraphRenderNode, config: NotesGraphForceConfig): number {
    const base = node.kind === 'tag' ? 5 : node.kind === 'missing' || node.kind === 'ambiguous' ? 6 : 7;
    const degreeWeight = Math.sqrt(Math.max(0, node.degree)) * 2.4;
    return Math.min(26, Math.max(4, (base + degreeWeight) * config.nodeSize));
}

export function labelVisibleForNode(node: NotesGraphRenderNode, zoomScale: number, config: NotesGraphForceConfig): boolean {
    if (node.kind === 'missing' || node.kind === 'ambiguous') return zoomScale >= 0.45;
    if (node.kind === 'tag') return config.labelDensity > 0.35 && zoomScale >= 0.65;
    if (config.labelDensity >= 0.75) return zoomScale >= 0.35;
    if (config.labelDensity >= 0.45) return node.degree > 0 && zoomScale >= 0.6;
    return node.degree >= 2 && zoomScale >= 0.85;
}
