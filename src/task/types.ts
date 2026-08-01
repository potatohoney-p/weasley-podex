export type TaskStatus = 'pending' | 'in_progress' | 'done' | 'cancelled';

export interface TaskItem {
    id: string;
    content: string;
    status: TaskStatus;
    owner?: string;
    after?: string;
    createdAt: string;
}

export interface TaskStoreData {
    version: number;
    tasks: TaskItem[];
}
