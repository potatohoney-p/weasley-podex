import type { CliCommandContext } from './command-context.js';
import type { SlashResult } from './types.js';

export async function taskHandler(args: string[], _ctx: CliCommandContext): Promise<SlashResult> {
    const { addTask, updateTask, listTasks, clearDone } = await import('../task/store.js');
    const sub = (args[0] || 'list').toLowerCase();

    switch (sub) {
        case 'add': {
            const rest = args.slice(1);
            const opts: { owner?: string; after?: string } = {};
            const filtered: string[] = [];
            for (let i = 0; i < rest.length; i++) {
                if (rest[i] === '--owner' && rest[i + 1]) { opts.owner = rest[++i]!; continue; }
                if (rest[i] === '--after' && rest[i + 1]) { opts.after = rest[++i]!; continue; }
                filtered.push(rest[i]!);
            }
            const content = filtered.join(' ').trim();
            if (!content) return { text: 'Usage: /task add <content> [--owner Name] [--after id]' };
            const task = addTask(content, opts);
            return { text: `Added: [${task.id}] ${task.content}${task.owner ? ` @${task.owner}` : ''}${task.after ? ` (after:${task.after})` : ''}` };
        }
        case 'done': {
            const id = args[1];
            if (!id) return { text: 'Usage: /task done <id>' };
            const task = updateTask(id, { status: 'done' });
            if (!task) return { text: `Task not found: ${id}` };
            return { text: `Done: [${task.id}] ${task.content}` };
        }
        case 'start': {
            const id = args[1];
            if (!id) return { text: 'Usage: /task start <id>' };
            const task = updateTask(id, { status: 'in_progress' });
            if (!task) return { text: `Task not found: ${id}` };
            return { text: `Started: [${task.id}] ${task.content}` };
        }
        case 'assign': {
            const id = args[1];
            const owner = args[2];
            if (!id || !owner) return { text: 'Usage: /task assign <id> <owner>' };
            const task = updateTask(id, { owner });
            if (!task) return { text: `Task not found: ${id}` };
            return { text: `Assigned: [${task.id}] → ${owner}` };
        }
        case 'edit': {
            const id = args[1];
            const content = args.slice(2).join(' ').trim();
            if (!id || !content) return { text: 'Usage: /task edit <id> <new content>' };
            const task = updateTask(id, { content });
            if (!task) return { text: `Task not found: ${id}` };
            return { text: `Edited: [${task.id}] ${task.content}` };
        }
        case 'cancel': {
            const id = args[1];
            if (!id) return { text: 'Usage: /task cancel <id>' };
            const task = updateTask(id, { status: 'cancelled' });
            if (!task) return { text: `Task not found: ${id}` };
            return { text: `Cancelled: [${task.id}] ${task.content}` };
        }
        case 'list': {
            const tasks = listTasks();
            if (!tasks.length) return { text: 'No tasks.' };
            const markers: Record<string, string> = { pending: '○', in_progress: '▶', done: '✓', cancelled: '✗' };
            const lines = tasks.map(t => {
                const mark = markers[t.status] || '?';
                const owner = t.owner ? ` @${t.owner}` : '';
                const dep = t.after ? ` (after:${t.after})` : '';
                return `${mark} [${t.id}] ${t.content}${owner}${dep}`;
            });
            return { text: lines.join('\n') };
        }
        case 'clear': {
            const removed = clearDone();
            return { text: removed > 0 ? `Cleared ${removed} done/cancelled tasks.` : 'Nothing to clear.' };
        }
        default:
            return { text: 'Usage: /task [add|edit|done|start|assign|cancel|list|clear]' };
    }
}
