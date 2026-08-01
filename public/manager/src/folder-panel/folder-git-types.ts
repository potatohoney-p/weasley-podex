import type { FolderPanelRowDecoration } from './folder-panel-types';

export type GitFileDecorationKind =
    | 'modified'
    | 'added'
    | 'deleted'
    | 'renamed'
    | 'untracked'
    | 'ignored'
    | 'conflict'
    | 'submodule';

export type GitFileDecoration = {
    path: string;
    repoRelativePath: string;
    kind: GitFileDecorationKind;
    staged: boolean;
    unstaged: boolean;
    ignored: boolean;
    conflict: boolean;
    submodule: boolean;
};

export type GitDirectoryDecoration = {
    path: string;
    repoRelativePath: string;
    kinds: GitFileDecorationKind[];
    changedCount: number;
};

export type GitStatusMapResult = {
    repoRoot: string;
    branch: string | null;
    head: string | null;
    dirty: boolean;
    files: GitFileDecoration[];
    directories: GitDirectoryDecoration[];
};

export type FolderPanelGitState = {
    available: boolean;
    loading: boolean;
    error: string | null;
    repoRoot: string | null;
    branch: string | null;
    head: string | null;
    dirty: boolean;
    decorationsByPath: Map<string, FolderPanelRowDecoration>;
};

export const EMPTY_FOLDER_GIT_STATE: FolderPanelGitState = {
    available: false,
    loading: false,
    error: null,
    repoRoot: null,
    branch: null,
    head: null,
    dirty: false,
    decorationsByPath: new Map(),
};
