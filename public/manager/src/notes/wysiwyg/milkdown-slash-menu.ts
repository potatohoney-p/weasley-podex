import type { MilkdownPlugin, Ctx } from '@milkdown/kit/ctx';
import { editorViewCtx, schemaCtx } from '@milkdown/kit/core';
import { Plugin, PluginKey } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { callCommand, $prose } from '@milkdown/kit/utils';
import {
    createCodeBlockCommand,
    insertHrCommand,
    wrapInBlockquoteCommand,
    wrapInBulletListCommand,
    wrapInHeadingCommand,
    wrapInOrderedListCommand,
} from '@milkdown/kit/preset/commonmark';
import { insertTableCommand } from '@milkdown/kit/preset/gfm';

type SlashMenuItem = {
    label: string;
    icon: string;
    run: (ctx: Ctx) => void;
};

const SLASH_MENU_ITEMS: SlashMenuItem[] = [
    { label: 'Heading 1', icon: 'H1', run: ctx => callCommand(wrapInHeadingCommand.key, 1)(ctx) },
    { label: 'Heading 2', icon: 'H2', run: ctx => callCommand(wrapInHeadingCommand.key, 2)(ctx) },
    { label: 'Heading 3', icon: 'H3', run: ctx => callCommand(wrapInHeadingCommand.key, 3)(ctx) },
    { label: 'Bullet List', icon: '•', run: ctx => callCommand(wrapInBulletListCommand.key)(ctx) },
    { label: 'Ordered List', icon: '1.', run: ctx => callCommand(wrapInOrderedListCommand.key)(ctx) },
    { label: 'Blockquote', icon: '❝', run: ctx => callCommand(wrapInBlockquoteCommand.key)(ctx) },
    { label: 'Code Block', icon: '<>', run: ctx => callCommand(createCodeBlockCommand.key)(ctx) },
    { label: 'Table', icon: '⊞', run: ctx => callCommand(insertTableCommand.key, { row: 3, col: 3 })(ctx) },
    { label: 'Divider', icon: '—', run: ctx => callCommand(insertHrCommand.key)(ctx) },
    {
        label: 'Math Block', icon: '∑', run: ctx => {
            const view = ctx.get(editorViewCtx);
            const schema = ctx.get(schemaCtx);
            const node = schema.nodes['math_block']?.create({ value: '' });
            if (!node) return;
            view.dispatch(view.state.tr.replaceSelectionWith(node, false).scrollIntoView());
        },
    },
];

let activeMenu: HTMLElement | null = null;
let activeIndex = 0;

function hideMenu(): void {
    if (activeMenu) {
        activeMenu.remove();
        activeMenu = null;
    }
}

function getSlashRange(view: EditorView): { from: number; to: number; filter: string } | null {
    const { state } = view;
    const { $from } = state.selection;
    if ($from.parent.type.name === 'code_block') return null;
    if ($from.marks().some(m => m.type.name === 'code_inline')) return null;
    const textBefore = $from.parent.textBetween(0, $from.parentOffset);
    const match = textBefore.match(/\/(\S*)$/);
    if (!match) return null;
    const slashOffset = $from.parentOffset - match[0].length;
    const from = $from.start() + slashOffset;
    const to = $from.pos;
    return { from, to, filter: match[1] };
}

function filterItems(filter: string): SlashMenuItem[] {
    if (!filter) return SLASH_MENU_ITEMS;
    const lower = filter.toLowerCase();
    return SLASH_MENU_ITEMS.filter(item => item.label.toLowerCase().includes(lower));
}

function renderMenuItems(menu: HTMLElement, items: SlashMenuItem[], onSelect: (item: SlashMenuItem) => void): void {
    menu.innerHTML = '';
    if (items.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'notes-slash-menu-empty';
        empty.textContent = 'No matches';
        menu.appendChild(empty);
        return;
    }
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `notes-slash-menu-item${i === activeIndex ? ' notes-slash-menu-item--active' : ''}`;
        button.setAttribute('role', 'option');
        const iconSpan = document.createElement('span');
        iconSpan.className = 'notes-slash-menu-icon';
        iconSpan.textContent = item.icon;
        const labelSpan = document.createElement('span');
        labelSpan.textContent = item.label;
        button.appendChild(iconSpan);
        button.appendChild(labelSpan);
        button.addEventListener('mousedown', e => {
            e.preventDefault();
            e.stopPropagation();
            onSelect(item);
        });
        menu.appendChild(button);
    }
}

function updateHighlight(): void {
    if (!activeMenu) return;
    const items = activeMenu.querySelectorAll('.notes-slash-menu-item');
    items.forEach((el, i) => el.classList.toggle('notes-slash-menu-item--active', i === activeIndex));
}

function showMenu(view: EditorView, ctx: Ctx, slashRange: { from: number; to: number; filter: string }): void {
    hideMenu();

    const items = filterItems(slashRange.filter);
    const menu = document.createElement('div');
    menu.className = 'notes-slash-menu';
    menu.setAttribute('role', 'listbox');
    activeIndex = 0;

    function executeItem(item: SlashMenuItem): void {
        const { state } = view;
        view.dispatch(state.tr.deleteRange(slashRange.from, slashRange.to));
        item.run(ctx);
        hideMenu();
        view.focus();
    }

    renderMenuItems(menu, items, executeItem);

    const coords = view.coordsAtPos(slashRange.from);
    menu.style.left = `${coords.left}px`;
    menu.style.top = `${coords.bottom + 4}px`;
    document.body.appendChild(menu);
    activeMenu = menu;

    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = `${window.innerWidth - rect.width - 8}px`;
    if (rect.bottom > window.innerHeight) menu.style.top = `${coords.top - rect.height - 4}px`;
}

const notesSlashMenuPlugin = $prose(ctx => {
    return new Plugin({
        key: new PluginKey('notes-slash-menu'),
        props: {
            handleKeyDown: (view, event) => {
                if (!activeMenu) return false;
                const range = getSlashRange(view);
                if (!range) { hideMenu(); return false; }
                const items = filterItems(range.filter);
                if (items.length === 0) return false;

                if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    activeIndex = (activeIndex + 1) % items.length;
                    updateHighlight();
                    return true;
                }
                if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    activeIndex = (activeIndex - 1 + items.length) % items.length;
                    updateHighlight();
                    return true;
                }
                if (event.key === 'Enter') {
                    event.preventDefault();
                    view.dispatch(view.state.tr.deleteRange(range.from, range.to));
                    items[activeIndex].run(ctx);
                    hideMenu();
                    view.focus();
                    return true;
                }
                if (event.key === 'Escape') {
                    event.preventDefault();
                    hideMenu();
                    return true;
                }
                return false;
            },
        },
        view: () => ({
            update: (view: EditorView) => {
                const range = getSlashRange(view);
                if (!range) { hideMenu(); return; }
                showMenu(view, ctx, range);
            },
            destroy: () => hideMenu(),
        }),
    });
});

export const notesMilkdownSlashMenu: MilkdownPlugin[] = [
    notesSlashMenuPlugin,
].flat();
