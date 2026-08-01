// Claims worker results and synthesizes team summary.
// Does NOT import provider SDKs.

import type { TeamPlan, TeamLane, TeamVerdict, TeamEvent } from './types.js';

export interface CollectedResult {
    laneId: string;
    role: string;
    verdict: TeamVerdict;
    summary: string;
    collectedAt: string;
}

export function collectLaneResult(
    lane: TeamLane,
    workerResult: string,
): CollectedResult {
    const verdict = extractVerdict(workerResult);
    return {
        laneId: lane.laneId,
        role: lane.role,
        verdict,
        summary: workerResult.slice(0, 500),
        collectedAt: new Date().toISOString(),
    };
}

function extractVerdict(text: string): TeamVerdict {
    const upper = text.toUpperCase();
    if (upper.includes('NEEDS_FIX')) return 'NEEDS_FIX';
    if (upper.includes('BLOCKED')) return 'BLOCKED';
    if (upper.includes('PASS') || upper.includes('DONE')) return 'PASS';
    return 'NEEDS_FIX';
}

export function synthesizeTeamReport(
    plan: TeamPlan,
    results: CollectedResult[],
): { overallVerdict: TeamVerdict; summary: string; events: TeamEvent[] } {
    const hasBlocker = results.some(r => r.verdict === 'BLOCKED');
    const hasFix = results.some(r => r.verdict === 'NEEDS_FIX');

    const overallVerdict: TeamVerdict = hasBlocker
        ? 'BLOCKED'
        : hasFix
            ? 'NEEDS_FIX'
            : 'PASS';

    const lines = results.map(r =>
        `- ${r.role} (${r.laneId}): ${r.verdict} — ${r.summary.slice(0, 100)}`,
    );

    const events: TeamEvent[] = results.map(r => ({
        teamId: plan.teamId,
        kind: 'collect' as const,
        laneId: r.laneId,
        timestamp: r.collectedAt,
        detail: `Collected ${r.role}: ${r.verdict}`,
    }));

    return {
        overallVerdict,
        summary: `Team ${plan.teamId}: ${overallVerdict}\n${lines.join('\n')}`,
        events,
    };
}
