export type GitWorktreeEntry = {
    path: string;
    head: string | null;
    branch: string | null;
    bare: boolean;
    detached: boolean;
    prunable: boolean;
    locked: boolean;
    reason: string | null;
    current: boolean;
};

export type GitWorktreeOperation =
    | { type: 'worktree-add'; path: string; branch: string; createBranch: boolean }
    | { type: 'worktree-remove'; path: string; force: boolean }
    | { type: 'worktree-prune' };

export type GitWorktreeOperationPreview = {
    command: string[];
    label: string;
    destructive: boolean;
    requiresConfirmation: true;
};

export type GitWorktreeOperationResult = {
    repoRoot: string;
    preview: GitWorktreeOperationPreview;
    stdout: string;
    worktrees: GitWorktreeEntry[];
};
