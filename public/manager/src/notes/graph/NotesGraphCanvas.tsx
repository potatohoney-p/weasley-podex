import { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { graphForceConfigFromSettings, labelVisibleForNode, radiusForNode } from './notes-graph-force';
import type { NotesGraphRenderData, NotesGraphRenderEdge, NotesGraphRenderNode } from './notes-graph-filter';
import type { NotesGraphSettings } from './notes-graph-settings';

type NotesGraphCanvasProps = {
    data: NotesGraphRenderData;
    selectedPath: string | null;
    settings: NotesGraphSettings;
    fitToken: number;
    onNavigate: (path: string) => void;
};

type SimNode = NotesGraphRenderNode & d3.SimulationNodeDatum;
type SimEdge = Omit<NotesGraphRenderEdge, 'source' | 'target'> & {
    source: SimNode;
    target: SimNode;
};

function nodeClassName(node: NotesGraphRenderNode, selectedPath: string | null): string {
    const selected = node.id === selectedPath ? ' is-selected' : '';
    return `notes-graph-node notes-graph-node-${node.kind}${selected}`;
}

function edgeClassName(edge: Pick<NotesGraphRenderEdge, 'status' | 'virtual'>): string {
    return `notes-graph-link notes-graph-link-${edge.status}${edge.virtual ? ' is-virtual' : ''}`;
}

export function NotesGraphCanvas(props: NotesGraphCanvasProps) {
    const svgRef = useRef<SVGSVGElement | null>(null);
    const hostRef = useRef<HTMLDivElement | null>(null);
    const navigateRef = useRef(props.onNavigate);
    const [size, setSize] = useState({ width: 900, height: 650 });
    navigateRef.current = props.onNavigate;
    const config = useMemo(() => graphForceConfigFromSettings(props.settings), [props.settings]);

    useEffect(() => {
        const host = hostRef.current;
        if (!host) return undefined;
        const updateSize = (): void => {
            const rect = host.getBoundingClientRect();
            setSize({
                width: Math.max(320, Math.floor(rect.width || 900)),
                height: Math.max(320, Math.floor(rect.height || 650)),
            });
        };
        updateSize();
        if (typeof window.ResizeObserver !== 'function') return undefined;
        const observer = new window.ResizeObserver(updateSize);
        observer.observe(host);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        const svgElement = svgRef.current;
        if (!svgElement) return undefined;
        const svg = d3.select(svgElement);
        svg.selectAll('*').remove();
        svg.attr('viewBox', `0 0 ${size.width} ${size.height}`);
        if (props.data.nodes.length === 0) return undefined;

        const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
        const nodes: SimNode[] = props.data.nodes.map(node => ({ ...node }));
        const nodeById = new Map(nodes.map(node => [node.id, node]));
        const edges: SimEdge[] = props.data.edges.flatMap(edge => {
            const source = nodeById.get(edge.source);
            const target = nodeById.get(edge.target);
            const edgeMeta = {
                raw: edge.raw,
                status: edge.status,
                ...(edge.resolvedPath ? { resolvedPath: edge.resolvedPath } : {}),
                ...(edge.virtual ? { virtual: edge.virtual } : {}),
            };
            return source && target ? [{ ...edgeMeta, source, target }] : [];
        });

        const defs = svg.append('defs');
        defs.append('marker')
            .attr('id', 'notes-graph-arrow')
            .attr('viewBox', '0 -5 10 10')
            .attr('refX', 15)
            .attr('refY', 0)
            .attr('markerWidth', 6)
            .attr('markerHeight', 6)
            .attr('orient', 'auto')
            .append('path')
            .attr('d', 'M0,-5L10,0L0,5')
            .attr('fill', 'currentColor');

        const viewport = svg.append('g').attr('class', 'notes-graph-viewport');
        const link = viewport.append('g')
            .attr('class', 'notes-graph-links')
            .selectAll<SVGLineElement, SimEdge>('line')
            .data(edges)
            .join('line')
            .attr('class', edgeClassName)
            .attr('marker-end', config.showArrows ? 'url(#notes-graph-arrow)' : null);

        const node = viewport.append('g')
            .attr('class', 'notes-graph-nodes')
            .selectAll<SVGGElement, SimNode>('g')
            .data(nodes)
            .join('g')
            .attr('class', d => nodeClassName(d, props.selectedPath))
            .attr('tabindex', d => d.kind === 'note' ? 0 : -1)
            .attr('role', d => d.kind === 'note' ? 'button' : 'img')
            .attr('aria-label', d => `${d.title}, ${d.kind}, ${d.degree} links`)
            .on('click', (_event: MouseEvent, d: SimNode) => {
                if (d.kind === 'note' && d.path) navigateRef.current(d.path);
            })
            .on('keydown', (event: KeyboardEvent, d: SimNode) => {
                if (d.kind !== 'note' || !d.path) return;
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                navigateRef.current(d.path);
            });

        node.append('circle')
            .attr('r', d => radiusForNode(d, config))
            .attr('fill', d => d.groupColor ?? null);

        node.append('text')
            .attr('class', 'notes-graph-label')
            .attr('x', d => radiusForNode(d, config) + 8)
            .attr('y', 4)
            .text(d => d.title);

        node.append('title')
            .text(d => d.groupLabel ? `${d.title} · ${d.groupLabel}` : d.title);

        const simulation = d3.forceSimulation<SimNode>(nodes)
            .force('link', d3.forceLink<SimNode, SimEdge>(edges).id(d => d.id).distance(config.linkDistance))
            .force('charge', d3.forceManyBody().strength(config.chargeStrength))
            .force('center', d3.forceCenter(size.width / 2, size.height / 2))
            .force('collision', d3.forceCollide<SimNode>().radius(d => radiusForNode(d, config) + 8));

        function renderFrame(): void {
            link
                .attr('x1', d => d.source.x ?? 0)
                .attr('y1', d => d.source.y ?? 0)
                .attr('x2', d => d.target.x ?? 0)
                .attr('y2', d => d.target.y ?? 0);
            node.attr('transform', d => `translate(${d.x ?? size.width / 2},${d.y ?? size.height / 2})`);
        }

        const zoom = d3.zoom<SVGSVGElement, unknown>()
            .scaleExtent([0.18, 5])
            .on('zoom', (event) => {
                viewport.attr('transform', event.transform);
                node.classed('is-label-visible', d => labelVisibleForNode(d, event.transform.k, config));
            });
        svg.call(zoom);
        const initialTransform = d3.zoomIdentity.translate(0, 0).scale(1);
        svg.call(zoom.transform, initialTransform);

        const drag = d3.drag<SVGGElement, SimNode>()
            .on('start', (event, d) => {
                if (!event.active && config.animate && !reduceMotion) simulation.alphaTarget(0.25).restart();
                d.fx = d.x;
                d.fy = d.y;
            })
            .on('drag', (event, d) => {
                d.fx = event.x;
                d.fy = event.y;
            })
            .on('end', (event, d) => {
                if (!event.active) simulation.alphaTarget(0);
                d.fx = null;
                d.fy = null;
            });
        node.call(drag);

        if (config.animate && !reduceMotion) {
            simulation.on('tick', renderFrame);
        } else {
            simulation.tick(120);
            renderFrame();
            simulation.stop();
        }
        return () => {
            simulation.stop();
            svg.on('.zoom', null);
        };
    }, [props.data, props.selectedPath, size, config, props.fitToken]);

    return (
        <div ref={hostRef} className="notes-graph-canvas" data-empty={props.data.nodes.length === 0 ? 'true' : 'false'}>
            {props.data.nodes.length === 0 ? (
                <div className="notes-graph-empty-state">No matching graph nodes</div>
            ) : null}
            <svg ref={svgRef} className="notes-graph-svg" aria-label="Notes graph" />
        </div>
    );
}
