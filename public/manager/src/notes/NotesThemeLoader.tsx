import { useEffect, useState } from 'react';
import { fetchNoteSnippets, fetchNoteSnippetCss, toggleNoteSnippet, setNoteTheme, type NoteSnippetInfo } from '../api';

const BUILTIN_THEMES = ['default', 'sepia', 'nord', 'solarized-dark'] as const;

export function NotesThemeSettings() {
    const [snippets, setSnippets] = useState<NoteSnippetInfo[]>([]);
    const [activeTheme, setActiveThemeState] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        void fetchNoteSnippets().then(data => {
            setSnippets(data.snippets);
            setActiveThemeState(data.activeTheme);
            setLoading(false);
        }).catch(() => setLoading(false));
    }, []);

    async function handleThemeChange(theme: string): Promise<void> {
        const value = theme === 'default' ? null : theme;
        setActiveThemeState(value);
        await setNoteTheme(value);
    }

    async function handleToggleSnippet(name: string, enabled: boolean): Promise<void> {
        setSnippets(prev => prev.map(s => s.name === name ? { ...s, enabled } : s));
        await toggleNoteSnippet(name, enabled);
    }

    if (loading) return <div className="notes-theme-loading">Loading theme settings...</div>;

    return (
        <div className="notes-theme-settings">
            <fieldset className="notes-theme-fieldset">
                <legend>Theme</legend>
                <select
                    value={activeTheme ?? 'default'}
                    onChange={e => void handleThemeChange(e.target.value)}
                >
                    {BUILTIN_THEMES.map(t => (
                        <option key={t} value={t}>{t}</option>
                    ))}
                </select>
            </fieldset>
            {snippets.length > 0 && (
                <fieldset className="notes-theme-fieldset">
                    <legend>CSS Snippets</legend>
                    <div className="notes-theme-warning">CSS snippets run trusted local code.</div>
                    {snippets.map(snippet => (
                        <label key={snippet.name} className="notes-snippet-toggle">
                            <input
                                type="checkbox"
                                checked={snippet.enabled}
                                onChange={e => void handleToggleSnippet(snippet.name, e.target.checked)}
                            />
                            {snippet.name}
                        </label>
                    ))}
                </fieldset>
            )}
        </div>
    );
}

export function NotesThemeInjector() {
    const [activeTheme, setActiveTheme] = useState<string | null>(null);
    const [enabledSnippets, setEnabledSnippets] = useState<string[]>([]);
    const [snippetCss, setSnippetCss] = useState<Map<string, string>>(new Map());

    useEffect(() => {
        void fetchNoteSnippets().then(data => {
            setActiveTheme(data.activeTheme);
            setEnabledSnippets(data.snippets.filter(s => s.enabled).map(s => s.name));
        });
    }, []);

    useEffect(() => {
        for (const name of enabledSnippets) {
            if (snippetCss.has(name)) continue;
            void fetchNoteSnippetCss(name).then(css => {
                setSnippetCss(prev => new Map(prev).set(name, css));
            });
        }
    }, [enabledSnippets]);

    useEffect(() => {
        const el = document.documentElement;
        if (activeTheme) {
            el.setAttribute('data-notes-theme', activeTheme);
        } else {
            el.removeAttribute('data-notes-theme');
        }
        return () => el.removeAttribute('data-notes-theme');
    }, [activeTheme]);

    const activeCss = enabledSnippets
        .map(name => snippetCss.get(name))
        .filter((css): css is string => Boolean(css))
        .join('\n');

    if (!activeCss) return null;

    return <style dangerouslySetInnerHTML={{ __html: activeCss }} />;
}
