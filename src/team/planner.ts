// Splits request into team lanes with file-scope and role metadata.
// Does NOT import provider SDKs.

import crypto from 'node:crypto';
import type { TeamPlan, TeamLane, TeamMode } from './types.js';

const DEFAULT_ROLES = ['Backend', 'Frontend', 'Docs'];

function generateTeamId(): string {
    const ts = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand = crypto.randomUUID().slice(0, 8);
    return `team-${ts}-${rand}`;
}

function generateLaneId(teamId: string, role: string): string {
    return `${teamId}-${role.toLowerCase()}`;
}

export function createTeamPlan(
    request: string,
    mode: TeamMode = 'audit-team',
    roles: string[] = DEFAULT_ROLES,
): TeamPlan {
    const teamId = generateTeamId();
    const lanes: TeamLane[] = roles.map(role => ({
        laneId: generateLaneId(teamId, role),
        role,
        employee: null,
        mode,
        scope: [],
        state: 'planned',
    }));

    return {
        teamId,
        mode,
        request,
        lanes,
        createdAt: new Date().toISOString(),
    };
}

export function assignEmployee(plan: TeamPlan, laneId: string, employee: string): TeamPlan {
    return {
        ...plan,
        lanes: plan.lanes.map(lane =>
            lane.laneId === laneId ? { ...lane, employee } : lane,
        ),
    };
}

export function setScopeForLane(plan: TeamPlan, laneId: string, scope: string[]): TeamPlan {
    return {
        ...plan,
        lanes: plan.lanes.map(lane =>
            lane.laneId === laneId ? { ...lane, scope } : lane,
        ),
    };
}

export function hasOverlappingScopes(plan: TeamPlan): { overlap: boolean; files: string[] } {
    const allFiles = new Map<string, string[]>();
    for (const lane of plan.lanes) {
        for (const file of lane.scope) {
            const existing = allFiles.get(file) ?? [];
            existing.push(lane.laneId);
            allFiles.set(file, existing);
        }
    }
    const overlapping = [...allFiles.entries()].filter(([, lanes]) => lanes.length > 1);
    return {
        overlap: overlapping.length > 0,
        files: overlapping.map(([file]) => file),
    };
}
