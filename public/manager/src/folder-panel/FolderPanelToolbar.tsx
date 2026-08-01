import { useState } from 'react';
import type { FolderWorktreeState } from './use-git-worktrees';
import type { GitWorktreeEntry } from './folder-worktree-types';

type FolderPanelToolbarProps = {
    canPickRoot: boolean;
    label: string;
    rootPath: string | null;
    gitSummary?: {
        available: boolean;
        loading: boolean;
        error: string | null;
        branch: string | null;
        head: string | null;
        dirty: boolean;
    } | undefined;
    worktreeSummary?: FolderWorktreeState | undefined;
    onPickFolder: () => void;
    onRefresh: () => void;
    onOpenWorktree?: ((path: string) => void) | undefined;
    onCopyWorktreePath?: ((path: string) => void) | undefined;
    onRevealWorktreePath?: ((path: string) => void) | undefined;
    onOpenWorktreeOps?: (() => void) | undefined;
};

function rootLabel(rootPath: string | null): string {
    if (rootPath === null) return 'Open Folder';
    return rootPath.split('/').pop() || rootPath;
}

function worktreeName(path: string): string {
    return path.split('/').filter(Boolean).pop() || path;
}

function worktreeRef(entry: GitWorktreeEntry): string {
    if (entry.branch) return entry.branch;
    if (entry.detached) return entry.head ? `detached ${entry.head}` : 'detached';
    return entry.head ?? 'worktree';
}

export function FolderPanelToolbar(props: FolderPanelToolbarProps) {
    const [worktreeMenuOpen, setWorktreeMenuOpen] = useState(false);
    const gitLabel = props.gitSummary?.loading
        ? 'Git ...'
        : props.gitSummary?.available
            ? `${props.gitSummary.branch ?? props.gitSummary.head ?? 'detached'} / ${props.gitSummary.dirty ? 'dirty' : 'clean'}`
            : props.gitSummary?.error
                ? 'Git unavailable'
                : null;
    const worktrees = props.worktreeSummary?.worktrees ?? [];
    const showWorktrees = props.rootPath !== null && (
        props.worktreeSummary?.loading ||
        props.worktreeSummary?.error ||
        worktrees.length > 0
    );
    const worktreeLabel = props.worktreeSummary?.loading
        ? 'Worktrees ...'
        : worktrees.length > 0
            ? `Worktrees ${worktrees.length}`
            : 'Worktrees';
    return (
        <div className="folder-toolbar">
            <button
                type="button"
                className="folder-pick-btn"
                onClick={props.onPickFolder}
                disabled={!props.canPickRoot}
            >
                {props.canPickRoot ? rootLabel(props.rootPath) : props.label}
            </button>
            {gitLabel && (
                <span className={props.gitSummary?.error ? 'folder-git-summary is-error' : 'folder-git-summary'} title={props.gitSummary?.error ?? undefined}>
                    {gitLabel}
                </span>
            )}
            {showWorktrees && (
                <div className="folder-worktree">
                    <button
                        type="button"
                        className="folder-worktree-btn"
                        onClick={() => setWorktreeMenuOpen(open => !open)}
                        disabled={props.worktreeSummary?.loading || worktrees.length === 0}
                        title={props.worktreeSummary?.error ?? undefined}
                    >
                        {worktreeLabel}
                    </button>
                    {worktreeMenuOpen && worktrees.length > 0 && (
                        <div className="folder-worktree-menu" role="menu" aria-label="Git worktrees">
                            {worktrees.map(entry => (
                                <div key={entry.path} className="folder-worktree-row" role="group" aria-label={entry.path}>
                                    <button
                                        type="button"
                                        className="folder-worktree-open"
                                        onClick={() => {
                                            setWorktreeMenuOpen(false);
                                            props.onOpenWorktree?.(entry.path);
                                        }}
                                    >
                                        <span className="folder-worktree-title">
                                            {worktreeName(entry.path)}
                                            {entry.current && <span className="folder-worktree-current">Current</span>}
                                        </span>
                                        <span className="folder-worktree-meta">{worktreeRef(entry)} · {entry.path}</span>
                                    </button>
                                    <span className="folder-worktree-actions">
                                        <button type="button" onClick={() => props.onCopyWorktreePath?.(entry.path)}>Copy</button>
                                        <button type="button" onClick={() => props.onRevealWorktreePath?.(entry.path)}>Finder</button>
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
            {props.rootPath !== null && props.gitSummary?.available && props.onOpenWorktreeOps && (
                <button type="button" className="folder-worktree-btn" onClick={props.onOpenWorktreeOps}>
                    Ops
                </button>
            )}
            {props.rootPath !== null && (
                <button type="button" className="folder-refresh" onClick={props.onRefresh} aria-label="Refresh folder">
                    ↻
                </button>
            )}
        </div>
    );
}
