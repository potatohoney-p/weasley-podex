import type { DashboardDiffRootPolicy, DashboardInstance } from '../types';
import type { DiffRootCandidate } from '../panels/desktop-bridge';

type DiffRootSettings = {
    diffRootPolicy: DashboardDiffRootPolicy;
    diffPinnedRootByPort: Record<string, string>;
    diffRecentRepoRoots: string[];
};

function pushCandidate(
    candidates: DiffRootCandidate[],
    seen: Set<string>,
    candidate: DiffRootCandidate,
): void {
    const path = candidate.path.trim();
    if (!path || seen.has(path)) return;
    seen.add(path);
    candidates.push({ ...candidate, path });
}

export function buildDiffRootCandidates(
    instance: DashboardInstance | null,
    homePath: string,
    settings: DiffRootSettings,
): DiffRootCandidate[] {
    const candidates: DiffRootCandidate[] = [];
    const seen = new Set<string>();
    const port = instance?.port == null ? null : String(instance.port);
    const pinned = port ? settings.diffPinnedRootByPort[port] : null;
    const projectDirs = instance?.projectDirs?.filter(Boolean) ?? [];
    const workingDir = instance?.workingDir ?? null;

    if (settings.diffRootPolicy === 'manual' && pinned) {
        pushCandidate(candidates, seen, { path: pinned, label: 'Pinned root', source: 'pinned' });
    }

    const orderedProjectDirs = projectDirs.map((path, index) => ({
        path,
        label: index === 0 ? 'Project root' : `Project root ${index + 1}`,
        source: 'project' as const,
    }));
    const workingCandidate = workingDir
        ? [{ path: workingDir, label: 'Working dir', source: 'working-dir' as const }]
        : [];
    const ordered = settings.diffRootPolicy === 'working-dir-first'
        ? [...workingCandidate, ...orderedProjectDirs]
        : [...orderedProjectDirs, ...workingCandidate];

    for (const candidate of ordered) pushCandidate(candidates, seen, candidate);
    if (settings.diffRootPolicy !== 'manual' && pinned) {
        pushCandidate(candidates, seen, { path: pinned, label: 'Pinned root', source: 'pinned' });
    }
    settings.diffRecentRepoRoots.forEach((path, index) => {
        pushCandidate(candidates, seen, {
            path,
            label: index === 0 ? 'Recent repo' : `Recent repo ${index + 1}`,
            source: 'recent',
        });
    });
    if (homePath) pushCandidate(candidates, seen, { path: homePath, label: 'Home fallback', source: 'home' });
    return candidates;
}
