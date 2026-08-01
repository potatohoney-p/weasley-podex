import { useEffect, useMemo, useRef, useState } from 'react';
import { useNoteCommands, type NoteCommand } from './notes-command-registry';
import { isCommandPaletteShortcut } from './notes-shortcuts';

type NotesCommandPaletteProps = {
    active: boolean;
};

type NoteCommandResult = {
    command: NoteCommand;
    score: number;
};

function normalize(value: string): string {
    return value.trim().toLowerCase();
}

function fuzzyScore(value: string, query: string): number | null {
    const haystack = normalize(value);
    const needle = normalize(query);
    if (!needle) return 1;
    if (haystack.startsWith(needle)) return 1000 - haystack.length;
    const contains = haystack.indexOf(needle);
    if (contains >= 0) return 700 - contains;

    let lastIndex = -1;
    let consecutive = 0;
    let score = 0;
    for (const char of needle) {
        const index = haystack.indexOf(char, lastIndex + 1);
        if (index < 0) return null;
        consecutive = index === lastIndex + 1 ? consecutive + 1 : 0;
        score += 4 + consecutive * 3 - Math.min(index, 40) * 0.1;
        lastIndex = index;
    }
    return score;
}

function scoreCommand(command: NoteCommand, query: string): NoteCommandResult | null {
    const candidates = [
        { value: command.label, boost: 120 },
        { value: command.section, boost: 40 },
        ...(command.keywords || []).map(keyword => ({ value: keyword, boost: 80 })),
    ];

    let best: NoteCommandResult | null = null;
    for (const candidate of candidates) {
        const fieldScore = fuzzyScore(candidate.value, query);
        if (fieldScore == null) continue;
        const score = fieldScore + candidate.boost;
        if (!best || score > best.score) best = { command, score };
    }
    return best;
}

export function filterNoteCommands(commands: NoteCommand[], query: string): NoteCommandResult[] {
    return commands
        .map(command => scoreCommand(command, query.trim()))
        .filter((result): result is NoteCommandResult => Boolean(result))
        .sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            const section = a.command.section.localeCompare(b.command.section);
            if (section !== 0) return section;
            return a.command.label.localeCompare(b.command.label);
        });
}

function nextIndex(current: number, delta: number, count: number): number {
    if (count <= 0) return 0;
    return Math.max(0, Math.min(count - 1, current + delta));
}

export function NotesCommandPalette(props: NotesCommandPaletteProps) {
    const commands = useNoteCommands();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement | null>(null);

    const results = useMemo(() => filterNoteCommands(commands, query), [commands, query]);
    const activeId = results[activeIndex] ? `notes-command-palette-option-${activeIndex}` : undefined;

    useEffect(() => {
        if (!props.active) {
            setOpen(false);
            return;
        }
        function handleShortcut(event: KeyboardEvent): void {
            if (!isCommandPaletteShortcut(event)) return;
            event.preventDefault();
            setOpen(current => !current);
        }
        window.addEventListener('keydown', handleShortcut);
        return () => window.removeEventListener('keydown', handleShortcut);
    }, [props.active]);

    useEffect(() => {
        if (!open) return;
        setQuery('');
        setActiveIndex(0);
        requestAnimationFrame(() => inputRef.current?.focus());
    }, [open]);

    useEffect(() => {
        if (activeIndex >= results.length) setActiveIndex(Math.max(0, results.length - 1));
    }, [activeIndex, results.length]);

    useEffect(() => {
        const active = activeId ? document.getElementById(activeId) : null;
        active?.scrollIntoView({ block: 'nearest' });
    }, [activeId]);

    function executeCommand(command: NoteCommand): void {
        if (command.disabled) return;
        setOpen(false);
        try {
            void Promise.resolve(command.run()).catch(error => {
                console.warn('[notes-command-palette]', error);
            });
        } catch (error) {
            console.warn('[notes-command-palette]', error);
        }
    }

    function runActive(): void {
        const command = results[activeIndex]?.command;
        if (command) executeCommand(command);
    }

    function handleInputKey(event: React.KeyboardEvent<HTMLInputElement>): void {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'p') {
            event.preventDefault();
            event.stopPropagation();
            return;
        }
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActiveIndex(index => nextIndex(index, 1, results.length));
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActiveIndex(index => nextIndex(index, -1, results.length));
        } else if (event.key === 'Enter') {
            event.preventDefault();
            runActive();
        } else if (event.key === 'Escape') {
            event.preventDefault();
            setOpen(false);
        }
    }

    if (!open) return null;

    return (
        <div className="notes-command-palette-backdrop" role="presentation" onClick={() => setOpen(false)} data-notes-palette>
            <section
                className="notes-command-palette"
                role="dialog"
                aria-modal="true"
                aria-label="Notes command palette"
                onClick={event => event.stopPropagation()}
                onKeyDown={event => event.stopPropagation()}
            >
                <input
                    ref={inputRef}
                    className="notes-command-palette-input"
                    type="search"
                    placeholder="Run command"
                    value={query}
                    onChange={event => { setQuery(event.currentTarget.value); setActiveIndex(0); }}
                    onKeyDown={handleInputKey}
                    aria-label="Run Notes command"
                    aria-controls="notes-command-palette-results"
                    aria-activedescendant={activeId}
                />
                <div
                    id="notes-command-palette-results"
                    className="notes-command-palette-list"
                    role="listbox"
                    aria-label="Matching commands"
                >
                    {results.map((result, index) => {
                        const command = result.command;
                        const active = index === activeIndex;
                        return (
                            <button
                                id={`notes-command-palette-option-${index}`}
                                key={command.id}
                                type="button"
                                role="option"
                                aria-selected={active}
                                aria-disabled={command.disabled || undefined}
                                className={`notes-command-palette-item${active ? ' is-active' : ''}${command.disabled ? ' is-disabled' : ''}`}
                                onMouseEnter={() => setActiveIndex(index)}
                                onClick={() => executeCommand(command)}
                            >
                                <span className="notes-command-palette-title">{command.label}</span>
                                <span className="notes-command-palette-meta">{command.disabledReason || command.section}</span>
                                {command.shortcut && <kbd className="notes-command-palette-shortcut">{command.shortcut}</kbd>}
                            </button>
                        );
                    })}
                    {results.length === 0 && <p className="notes-command-palette-empty">No matching commands.</p>}
                </div>
                <footer className="notes-command-palette-footer">
                    <span><kbd>Up/Down</kbd> move</span>
                    <span><kbd>Enter</kbd> run</span>
                    <span><kbd>Esc</kbd> close</span>
                </footer>
            </section>
        </div>
    );
}
