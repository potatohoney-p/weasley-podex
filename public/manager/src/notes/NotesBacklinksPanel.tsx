import { useCallback, useState, type ReactNode } from 'react';
import type { NoteLinkRef } from '../types';

type NotesBacklinksPanelProps = {
    backlinks: NoteLinkRef[];
    onNavigate: (path: string) => void;
};

function backlinkTitle(path: string): string {
    const name = path.split('/').pop() ?? path;
    return name.endsWith('.md') ? name.slice(0, -3) : name;
}

function highlightWikilink(context: string): ReactNode[] {
    const parts: ReactNode[] = [];
    const regex = /\[\[([^\]]+)\]\]/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let key = 0;
    while ((match = regex.exec(context)) !== null) {
        if (match.index > lastIndex) {
            parts.push(context.slice(lastIndex, match.index));
        }
        parts.push(
            <mark key={key++} className="backlink-highlight">
                {'[[' + match[1] + ']]'}
            </mark>,
        );
        lastIndex = regex.lastIndex;
    }
    if (lastIndex < context.length) {
        parts.push(context.slice(lastIndex));
    }
    return parts;
}

export function NotesBacklinksPanel(props: NotesBacklinksPanelProps) {
    const [collapsed, setCollapsed] = useState(false);

    const handleClick = useCallback((path: string) => {
        props.onNavigate(path);
    }, [props.onNavigate]);

    const count = props.backlinks.length;

    return (
        <div className="notes-backlinks-panel">
            <button
                className="notes-backlinks-header"
                onClick={() => setCollapsed(c => !c)}
            >
                <span className="notes-backlinks-chevron">
                    {collapsed ? '▶' : '▼'}
                </span>
                <span>Backlinks</span>
                <span className="notes-backlinks-count">{count}</span>
            </button>
            {!collapsed && (
                <div className="notes-backlinks-list">
                    {count === 0 && (
                        <div className="notes-backlinks-empty">
                            No backlinks found
                        </div>
                    )}
                    {props.backlinks.map((entry, i) => {
                        const context = entry.raw.length > 120
                            ? entry.raw.slice(0, 120) + '...'
                            : entry.raw;
                        return (
                            <button
                                key={`${entry.sourcePath}:${entry.line}:${i}`}
                                className="notes-backlink-entry"
                                onClick={() => handleClick(entry.sourcePath)}
                            >
                                <span className="notes-backlink-title">
                                    {backlinkTitle(entry.sourcePath)}
                                </span>
                                <span className="notes-backlink-line">
                                    L{entry.line}
                                </span>
                                <span className="notes-backlink-context">
                                    {highlightWikilink(context)}
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
