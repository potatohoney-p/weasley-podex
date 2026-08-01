import type { ReactElement } from 'react';
import type { NotesGraphGroup, NotesGraphSection, NotesGraphSettings } from './notes-graph-settings';
import { createNotesGraphGroup, NOTES_GRAPH_GROUP_COLORS, NOTES_GRAPH_SECTIONS } from './notes-graph-settings';

type NotesGraphControlsPanelProps = {
    settings: NotesGraphSettings;
    selectedPath: string | null;
    onChange: (settings: NotesGraphSettings) => void;
    onReset: () => void;
    onFit: () => void;
    onClose: () => void;
};

type ToggleKey =
    | 'existingFilesOnly'
    | 'showOrphans'
    | 'showTags'
    | 'showAttachments'
    | 'focusSelected'
    | 'showArrows'
    | 'animate';

function sectionLabel(section: NotesGraphSection): string {
    if (section === 'filters') return 'Filters';
    if (section === 'display') return 'Display';
    if (section === 'forces') return 'Forces';
    return 'Groups';
}

function nextSettings(settings: NotesGraphSettings, patch: Partial<NotesGraphSettings>): NotesGraphSettings {
    return {
        ...settings,
        ...patch,
        collapsedSections: patch.collapsedSections ?? settings.collapsedSections,
        groups: patch.groups ?? settings.groups,
    };
}

function ToggleRow(props: {
    label: string;
    checked: boolean;
    onChange: (value: boolean) => void;
    disabled?: boolean;
}): ReactElement {
    return (
        <label className={`notes-graph-toggle${props.disabled ? ' is-disabled' : ''}`}>
            <span>{props.label}</span>
            <input type="checkbox" checked={props.checked} disabled={props.disabled} onChange={event => props.onChange(event.currentTarget.checked)} />
        </label>
    );
}

export function NotesGraphControlsPanel(props: NotesGraphControlsPanelProps) {
    const { settings } = props;

    function patch(patchValue: Partial<NotesGraphSettings>): void {
        props.onChange(nextSettings(settings, patchValue));
    }

    function toggle(key: ToggleKey): void {
        patch({ [key]: !settings[key] } as Partial<Pick<NotesGraphSettings, ToggleKey>>);
    }

    function toggleSection(section: NotesGraphSection): void {
        patch({
            collapsedSections: {
                ...settings.collapsedSections,
                [section]: !settings.collapsedSections[section],
            },
        });
    }

    function updateGroup(id: string, patchValue: Partial<NotesGraphGroup>): void {
        patch({ groups: settings.groups.map(group => group.id === id ? { ...group, ...patchValue } : group) });
    }

    function addGroup(): void {
        patch({ groups: [...settings.groups, createNotesGraphGroup(settings.groups.length, settings.query)] });
    }

    function removeGroup(id: string): void {
        patch({ groups: settings.groups.filter(group => group.id !== id) });
    }

    return (
        <aside className="notes-graph-controls" aria-label="Graph controls">
            <header className="notes-graph-controls-header">
                <div>
                    <h3>Graph</h3>
                    <span>{props.selectedPath ? 'Focus-ready' : 'Global view'}</span>
                </div>
                <button type="button" className="notes-graph-icon-button" onClick={props.onClose} aria-label="Close graph controls">X</button>
            </header>

            {NOTES_GRAPH_SECTIONS.map(section => (
                <section key={section} className="notes-graph-control-section">
                    <button type="button" className="notes-graph-section-toggle" onClick={() => toggleSection(section)} aria-expanded={!settings.collapsedSections[section]}>
                        <span>{sectionLabel(section)}</span>
                        <span>{settings.collapsedSections[section] ? '+' : '-'}</span>
                    </button>
                    {!settings.collapsedSections[section] && section === 'filters' ? (
                        <div className="notes-graph-control-body">
                            <label className="notes-graph-field">
                                <span>Search</span>
                                <input value={settings.query} onChange={event => patch({ query: event.currentTarget.value })} placeholder="title, path:, tag:, kind:" />
                            </label>
                            <ToggleRow label="Existing files only" checked={settings.existingFilesOnly} onChange={() => toggle('existingFilesOnly')} />
                            <ToggleRow label="Show orphans" checked={settings.showOrphans} onChange={() => toggle('showOrphans')} />
                            <ToggleRow label="Show tags" checked={settings.showTags} onChange={() => toggle('showTags')} />
                            <ToggleRow label="Show attachments" checked={settings.showAttachments} onChange={() => toggle('showAttachments')} />
                            <ToggleRow label="Focus selected" checked={settings.focusSelected} disabled={!props.selectedPath} onChange={() => toggle('focusSelected')} />
                            <label className="notes-graph-field">
                                <span>Depth {settings.focusDepth}</span>
                                <input type="range" min="1" max="4" value={settings.focusDepth} disabled={!settings.focusSelected || !props.selectedPath} onChange={event => patch({ focusDepth: Number(event.currentTarget.value) })} />
                            </label>
                        </div>
                    ) : null}
                    {!settings.collapsedSections[section] && section === 'display' ? (
                        <div className="notes-graph-control-body">
                            <label className="notes-graph-field">
                                <span>Node size {settings.nodeSize.toFixed(1)}</span>
                                <input type="range" min="0.6" max="2" step="0.1" value={settings.nodeSize} onChange={event => patch({ nodeSize: Number(event.currentTarget.value) })} />
                            </label>
                            <label className="notes-graph-field">
                                <span>Labels {Math.round(settings.labelDensity * 100)}%</span>
                                <input type="range" min="0" max="1" step="0.05" value={settings.labelDensity} onChange={event => patch({ labelDensity: Number(event.currentTarget.value) })} />
                            </label>
                            <ToggleRow label="Show arrows" checked={settings.showArrows} onChange={() => toggle('showArrows')} />
                            <ToggleRow label="Animate" checked={settings.animate} onChange={() => toggle('animate')} />
                        </div>
                    ) : null}
                    {!settings.collapsedSections[section] && section === 'forces' ? (
                        <div className="notes-graph-control-body">
                            <label className="notes-graph-field">
                                <span>Link distance {settings.linkDistance}</span>
                                <input type="range" min="40" max="240" value={settings.linkDistance} onChange={event => patch({ linkDistance: Number(event.currentTarget.value) })} />
                            </label>
                            <label className="notes-graph-field">
                                <span>Repel {Math.abs(settings.chargeStrength)}</span>
                                <input type="range" min="-800" max="-20" value={settings.chargeStrength} onChange={event => patch({ chargeStrength: Number(event.currentTarget.value) })} />
                            </label>
                            <div className="notes-graph-control-row">
                                <button type="button" onClick={props.onFit}>Fit</button>
                                <button type="button" onClick={props.onReset}>Reset</button>
                            </div>
                        </div>
                    ) : null}
                    {!settings.collapsedSections[section] && section === 'groups' ? (
                        <div className="notes-graph-control-body">
                            <ToggleRow label="Query groups" checked={settings.groupMode === 'query'} onChange={value => patch({ groupMode: value ? 'query' : 'off' })} />
                            <div className="notes-graph-groups">
                                {settings.groups.map((group, index) => (
                                    <div key={group.id} className="notes-graph-group-row">
                                        <input className="notes-graph-color" type="color" value={group.color} onChange={event => updateGroup(group.id, { color: event.currentTarget.value })} />
                                        <input value={group.label} onChange={event => updateGroup(group.id, { label: event.currentTarget.value })} aria-label={`Group ${index + 1} label`} />
                                        <input value={group.query} onChange={event => updateGroup(group.id, { query: event.currentTarget.value })} aria-label={`Group ${index + 1} query`} />
                                        <button type="button" onClick={() => updateGroup(group.id, { enabled: !group.enabled })} aria-pressed={group.enabled}>{group.enabled ? 'On' : 'Off'}</button>
                                        <button type="button" className="notes-graph-icon-button" onClick={() => removeGroup(group.id)} aria-label={`Remove ${group.label}`}>X</button>
                                    </div>
                                ))}
                            </div>
                            <div className="notes-graph-swatches" aria-label="Group color presets">
                                {NOTES_GRAPH_GROUP_COLORS.map(color => <span key={color} style={{ background: color }} />)}
                            </div>
                            <button type="button" onClick={addGroup}>Add group</button>
                        </div>
                    ) : null}
                </section>
            ))}
        </aside>
    );
}
