import type { MilkdownPlugin, Ctx } from '@milkdown/kit/ctx';
import { Plugin, PluginKey, TextSelection } from '@milkdown/kit/prose/state';
import { callCommand, $prose } from '@milkdown/kit/utils';
import {
    addColAfterCommand,
    addColBeforeCommand,
    addRowAfterCommand,
    addRowBeforeCommand,
    deleteSelectedCellsCommand,
    selectTableCommand,
} from '@milkdown/kit/preset/gfm';

type TableMenuAction = {
    label: string;
    separator?: boolean;
    run: (ctx: Ctx) => void;
};

const TABLE_MENU_ACTIONS: TableMenuAction[] = [
    { label: 'Insert Row Above', run: ctx => callCommand(addRowBeforeCommand.key)(ctx) },
    { label: 'Insert Row Below', run: ctx => callCommand(addRowAfterCommand.key)(ctx) },
    { label: 'Insert Column Left', run: ctx => callCommand(addColBeforeCommand.key)(ctx) },
    { label: 'Insert Column Right', run: ctx => callCommand(addColAfterCommand.key)(ctx) },
    { label: '', separator: true, run: () => {} },
    { label: 'Delete Selected Cells', run: ctx => callCommand(deleteSelectedCellsCommand.key)(ctx) },
    { label: 'Select Entire Table', run: ctx => callCommand(selectTableCommand.key)(ctx) },
];

function isInsideTable(view: import('@milkdown/kit/prose/view').EditorView, pos: number): boolean {
    const resolved = view.state.doc.resolve(pos);
    for (let depth = resolved.depth; depth > 0; depth--) {
        if (resolved.node(depth).type.name === 'table') return true;
    }
    return false;
}

let activeMenu: HTMLElement | null = null;

function hideActiveMenu(): void {
    if (activeMenu) {
        activeMenu.remove();
        activeMenu = null;
    }
}

function showTableMenu(event: MouseEvent, ctx: Ctx): void {
    hideActiveMenu();

    const menu = document.createElement('div');
    menu.className = 'notes-table-context-menu';
    menu.setAttribute('role', 'menu');

    for (const item of TABLE_MENU_ACTIONS) {
        if (item.separator) {
            const sep = document.createElement('div');
            sep.className = 'notes-table-context-menu-separator';
            menu.appendChild(sep);
            continue;
        }
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'notes-table-context-menu-item';
        button.setAttribute('role', 'menuitem');
        button.textContent = item.label;
        button.addEventListener('mousedown', e => {
            e.preventDefault();
            e.stopPropagation();
            item.run(ctx);
            hideActiveMenu();
        });
        menu.appendChild(button);
    }

    menu.style.left = `${event.clientX}px`;
    menu.style.top = `${event.clientY}px`;
    document.body.appendChild(menu);
    activeMenu = menu;

    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = `${event.clientX - rect.width}px`;
    if (rect.bottom > window.innerHeight) menu.style.top = `${event.clientY - rect.height}px`;

    function dismiss(e: Event): void {
        if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
        hideActiveMenu();
        document.removeEventListener('mousedown', dismiss);
        document.removeEventListener('keydown', dismiss);
    }
    setTimeout(() => {
        document.addEventListener('mousedown', dismiss);
        document.addEventListener('keydown', dismiss);
    }, 0);
}

const notesTableContextMenu = $prose(ctx => {
    return new Plugin({
        key: new PluginKey('notes-table-context-menu'),
        props: {
            handleDOMEvents: {
                contextmenu: (view, event) => {
                    const pos = view.posAtCoords({ left: event.clientX, top: event.clientY });
                    if (!pos) return false;
                    if (!isInsideTable(view, pos.pos)) return false;

                    event.preventDefault();
                    const resolved = view.state.doc.resolve(pos.pos);
                    const selection = TextSelection.near(resolved);
                    view.dispatch(view.state.tr.setSelection(selection));

                    showTableMenu(event, ctx);
                    return true;
                },
            },
        },
    });
});

export const notesMilkdownTableMenu: MilkdownPlugin[] = [
    notesTableContextMenu,
].flat();
