import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchGitWorktrees } from './folder-worktree-client';
import type { GitWorktreeEntry } from './folder-worktree-types';

type UseGitWorktreesInput = {
    folderPanelRoot: string | null;
    repoRoot: string | null;
    enabled: boolean;
    refreshToken: number;
};

export type FolderWorktreeState = {
    available: boolean;
    loading: boolean;
    error: string | null;
    repoRoot: string | null;
    worktrees: GitWorktreeEntry[];
    refresh: () => void;
};

const EMPTY_WORKTREE_STATE: Omit<FolderWorktreeState, 'refresh'> = {
    available: false,
    loading: false,
    error: null,
    repoRoot: null,
    worktrees: [] as GitWorktreeEntry[],
};

export function useGitWorktrees(input: UseGitWorktreesInput): FolderWorktreeState {
    const { folderPanelRoot, repoRoot, enabled, refreshToken } = input;
    const [manualRefreshToken, setManualRefreshToken] = useState(0);
    const [state, setState] = useState(EMPTY_WORKTREE_STATE);
    const refresh = useCallback(() => setManualRefreshToken(token => token + 1), []);

    useEffect(() => {
        if (!enabled || folderPanelRoot === null) {
            setState(EMPTY_WORKTREE_STATE);
            return;
        }
        let cancelled = false;
        setState(prev => ({ ...prev, loading: true, error: null }));
        void (async () => {
            const result = await fetchGitWorktrees(folderPanelRoot, repoRoot ?? undefined);
            if (cancelled) return;
            setState({
                available: result.ok && result.worktrees.length > 0,
                loading: false,
                error: result.error,
                repoRoot: result.repoRoot,
                worktrees: result.worktrees,
            });
        })();
        return () => { cancelled = true; };
    }, [enabled, folderPanelRoot, manualRefreshToken, refreshToken, repoRoot]);

    return useMemo(() => ({ ...state, refresh }), [refresh, state]);
}
