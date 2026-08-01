import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { JAW_HOME } from '../core/config.js';
import type { TaskItem, TaskStoreData, TaskStatus } from './types.js';

const TASKS_PATH = path.join(JAW_HOME, 'tasks.json');

function readStore(): TaskStoreData {
    try {
        return JSON.parse(fs.readFileSync(TASKS_PATH, 'utf8')) as TaskStoreData;
    } catch {
        return { version: 1, tasks: [] };
    }
}

function writeStore(store: TaskStoreData): void {
    const tmp = TASKS_PATH + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
    fs.renameSync(tmp, TASKS_PATH);
}

function genId(): string {
    return crypto.randomBytes(4).toString('hex');
}

export function addTask(content: string, opts?: { owner?: string; after?: string }): TaskItem {
    const store = readStore();
    const task: TaskItem = {
        id: genId(),
        content: content.trim(),
        status: 'pending',
        createdAt: new Date().toISOString(),
    };
    if (opts?.owner) task.owner = opts.owner;
    if (opts?.after) task.after = opts.after;
    store.tasks.push(task);
    writeStore(store);
    return task;
}

export function updateTask(id: string, patch: Partial<Pick<TaskItem, 'status' | 'owner' | 'after' | 'content'>>): TaskItem | null {
    const store = readStore();
    const task = store.tasks.find(t => t.id === id);
    if (!task) return null;
    if (patch.status !== undefined) task.status = patch.status;
    if (patch.owner !== undefined) { if (patch.owner) task.owner = patch.owner; else delete task.owner; }
    if (patch.after !== undefined) { if (patch.after) task.after = patch.after; else delete task.after; }
    if (patch.content !== undefined) task.content = patch.content.trim();
    writeStore(store);
    return task;
}

export function listTasks(filter?: { status?: TaskStatus; owner?: string }): TaskItem[] {
    const store = readStore();
    let tasks = store.tasks;
    if (filter?.status) tasks = tasks.filter(t => t.status === filter.status);
    if (filter?.owner) tasks = tasks.filter(t => t.owner === filter.owner);
    return tasks;
}

export function clearDone(): number {
    const store = readStore();
    const before = store.tasks.length;
    store.tasks = store.tasks.filter(t => t.status !== 'done' && t.status !== 'cancelled');
    writeStore(store);
    return before - store.tasks.length;
}

export function getTask(id: string): TaskItem | null {
    return readStore().tasks.find(t => t.id === id) ?? null;
}
