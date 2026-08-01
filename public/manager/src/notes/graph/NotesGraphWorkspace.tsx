import { useEffect, useMemo, useRef, useState } from 'react';
import { NotesGraphCanvas } from './NotesGraphCanvas';
import { NotesGraphControlsPanel } from './NotesGraphControlsPanel';
import { deriveNotesGraphData } from './notes-graph-filter';
import {
    cloneNotesGraphSettings,
    DEFAULT_NOTES_GRAPH_SETTINGS,
    normalizeNotesGraphSettings,
    type NotesGraphSettings,
} from './notes-graph-settings';
import type { NotesVaultIndexSnapshot } from '../notes-types';

export type NotesGraphRuntimeBoundary = {
    dataPlane: 'dashboard-notes-api';
    shellPanels: 'render-only';
};

export const NOTES_GRAPH_RUNTIME_BOUNDARY: NotesGraphRuntimeBoundary = {
    dataPlane: 'dashboard-notes-api',
    shellPanels: 'render-only',
};

type NotesGraphWorkspaceProps = {
    vaultIndex: NotesVaultIndexSnapshot | null;
    selectedPath: string | null;
    settings?: NotesGraphSettings | undefined;
    onSettingsChange?: (settings: NotesGraphSettings) => void;
    onNavigate: (path: string) => void;
};

function defaultSettings(): NotesGraphSettings {
    return cloneNotesGraphSettings(DEFAULT_NOTES_GRAPH_SETTINGS);
}

export function NotesGraphWorkspace(props: NotesGraphWorkspaceProps) {
    // Graph is intentionally web-capable: data comes from the dashboard notes API.
    // Electron side panels may render Jawsidian content, but must not become the
    // source of graph connectivity or persistence.
    const [draft, setDraft] = useState<NotesGraphSettings>(() => normalizeNotesGraphSettings(props.settings ?? defaultSettings()));
    const [fitToken, setFitToken] = useState(0);
    const persistTimerRef = useRef<number | null>(null);

    useEffect(() => {
        setDraft(normalizeNotesGraphSettings(props.settings ?? defaultSettings()));
    }, [props.settings]);

    useEffect(() => () => {
        if (persistTimerRef.current != null) window.clearTimeout(persistTimerRef.current);
    }, []);

    function persist(next: NotesGraphSettings, immediate = false): void {
        setDraft(next);
        if (!props.onSettingsChange) return;
        if (persistTimerRef.current != null) window.clearTimeout(persistTimerRef.current);
        if (immediate) {
            props.onSettingsChange(next);
            return;
        }
        persistTimerRef.current = window.setTimeout(() => props.onSettingsChange?.(next), 140);
    }

    function resetSettings(): void {
        persist(defaultSettings(), true);
        setFitToken(token => token + 1);
    }

    function closePanel(): void {
        persist({ ...draft, panelOpen: false }, true);
    }

    function openPanel(): void {
        persist({ ...draft, panelOpen: true }, true);
    }

    const graphData = useMemo(
        () => deriveNotesGraphData(props.vaultIndex, draft, props.selectedPath),
        [props.vaultIndex, draft, props.selectedPath],
    );

    return (
        <div className={`notes-graph-workspace${draft.panelOpen ? ' has-controls' : ''}`}>
            <header className="notes-graph-toolbar">
                <div className="notes-graph-counts" aria-live="polite">
                    <strong>{graphData.noteCount}</strong> notes
                    <span>{graphData.linkCount} links</span>
                    <span>{graphData.missingCount} unresolved</span>
                    {graphData.tagCount > 0 ? <span>{graphData.tagCount} tags</span> : null}
                </div>
                <div className="notes-graph-actions">
                    <button type="button" onClick={() => setFitToken(token => token + 1)}>Fit</button>
                    <button type="button" onClick={resetSettings}>Reset</button>
                    {!draft.panelOpen ? <button type="button" onClick={openPanel}>Controls</button> : null}
                </div>
            </header>
            <div className="notes-graph-body">
                <NotesGraphCanvas
                    data={graphData}
                    selectedPath={props.selectedPath}
                    settings={draft}
                    fitToken={fitToken}
                    onNavigate={props.onNavigate}
                />
                {draft.panelOpen ? (
                    <NotesGraphControlsPanel
                        settings={draft}
                        selectedPath={props.selectedPath}
                        onChange={next => persist(next)}
                        onReset={resetSettings}
                        onFit={() => setFitToken(token => token + 1)}
                        onClose={closePanel}
                    />
                ) : null}
            </div>
        </div>
    );
}
