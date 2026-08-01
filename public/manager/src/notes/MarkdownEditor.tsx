import CodeMirror from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { Prec, type Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { notesEditorTheme, notesSyntaxHighlighting } from './editor-theme';
import { markdownShortcutsKeymap } from './markdown-shortcuts';
import { MarkdownPreview } from './MarkdownPreview';
import { RichMarkdownPortalHost } from './rich-markdown/RichMarkdownPortalHost';
import { richMarkdownExtension } from './rich-markdown/rich-markdown-extension';
import { richMarkdownPastePolicy } from './rich-markdown/paste-policy';
import { wikiLinkCodeMirrorCompletion } from './wiki-link-codemirror-completion';
import type { NotesAuthoringMode, NotesNoteLinkRef, NotesNoteMetadata } from './notes-types';
import type { RichMarkdownWidgetRegistration } from './rich-markdown/rich-markdown-types';

let vimExtensionCache: Extension | null = null;
async function loadVimExtension(): Promise<Extension> {
    if (vimExtensionCache) return vimExtensionCache;
    const { vim } = await import('@replit/codemirror-vim');
    vimExtensionCache = vim();
    return vimExtensionCache;
}

const MilkdownWysiwygEditor = lazy(async () => {
    const module = await import('./wysiwyg/MilkdownWysiwygEditor');
    return { default: module.MilkdownWysiwygEditor };
});

type MarkdownEditorProps = {
    active: boolean;
    authoringMode: NotesAuthoringMode;
    content: string;
    notePath: string;
    outgoing: readonly NotesNoteLinkRef[];
    notes: readonly NotesNoteMetadata[];
    activeTag: string | null;
    wordWrap: boolean;
    vimMode: boolean;
    onChange: (value: string) => void;
    onTagSelect: (tag: string | null) => void;
    onWikiLinkNavigate: (path: string) => void;
};

export function MarkdownEditor(props: MarkdownEditorProps) {
    const [widgets, setWidgets] = useState<Map<string, RichMarkdownWidgetRegistration>>(() => new Map());
    const [vimExt, setVimExt] = useState<Extension | null>(null);
    const isWysiwyg = props.authoringMode === 'wysiwyg';

    useEffect(() => {
        if (!props.vimMode) {
            setVimExt(null);
            return;
        }
        let cancelled = false;
        void loadVimExtension().then(ext => {
            if (!cancelled) setVimExt(ext);
        });
        return () => { cancelled = true; };
    }, [props.vimMode]);
    const registerWidget = useCallback((registration: RichMarkdownWidgetRegistration): void => {
        setWidgets(current => {
            const next = new Map(current);
            next.set(registration.id, registration);
            return next;
        });
    }, []);
    const unregisterWidget = useCallback((id: string): void => {
        setWidgets(current => {
            if (!current.has(id)) return current;
            const next = new Map(current);
            next.delete(id);
            return next;
        });
    }, []);
    const requestMeasure = useCallback((): void => {
        window.dispatchEvent(new Event('resize'));
    }, []);
    const extensions = useMemo(() => {
        const base = [
            Prec.highest(keymap.of(markdownShortcutsKeymap)),
            notesEditorTheme,
            notesSyntaxHighlighting,
            markdown({ codeLanguages: languages }),
            wikiLinkCodeMirrorCompletion(props.notes),
            richMarkdownPastePolicy({
                notePath: props.notePath,
                onError: error => console.warn('[notes-image-paste]', error),
            }),
            richMarkdownExtension({
                enabled: props.authoringMode === 'rich' || props.authoringMode === 'wysiwyg',
                active: props.active,
                registerWidget,
                unregisterWidget,
                requestMeasure,
            }),
        ];
        if (props.wordWrap) base.push(EditorView.lineWrapping);
        if (vimExt) base.unshift(vimExt);
        return base;
    }, [props.active, props.authoringMode, props.notePath, props.notes, props.wordWrap, vimExt, registerWidget, requestMeasure, unregisterWidget]);

    if (isWysiwyg) {
        return (
            <div className="notes-editor notes-wysiwyg-editor">
                <Suspense fallback={<div className="notes-wysiwyg-loading">Loading WYSIWYG editor...</div>}>
                    <MilkdownWysiwygEditor
                        active={props.active}
                        content={props.content}
                        notePath={props.notePath}
                        outgoing={props.outgoing}
                        notes={props.notes}
                        activeTag={props.activeTag}
                        onChange={props.onChange}
                        onTagSelect={props.onTagSelect}
                        onWikiLinkNavigate={props.onWikiLinkNavigate}
                    />
                </Suspense>
            </div>
        );
    }

    return (
        <div className="notes-editor">
            <RichMarkdownPortalHost widgets={[...widgets.values()]} />
            <CodeMirror
                value={props.content}
                extensions={extensions}
                onChange={props.onChange}
                height="100%"
                basicSetup={{
                    lineNumbers: true,
                    foldGutter: true,
                    highlightActiveLine: true,
                }}
            />
        </div>
    );
}
