// Goal-run controller: manages run state and drives forward-only PABCD transitions.
// Does NOT import provider SDKs.

import fs from 'node:fs';
import path from 'node:path';
import type { GoalRunState, GoalRunMode, GoalRunBudget } from './types.js';
import { checkPreflightGates, allGatesPassed, checkBudget } from './policy.js';
import { classifyFailure } from './failure-matrix.js';
import { getActiveGoal } from '../goal/store.js';
import { getState } from '../orchestrator/state-machine.js';
import { getActiveWorkers, hasPendingWorkerReplays } from '../orchestrator/worker-registry.js';
import { WEASLEY_PODEX_HOME } from '../core/config.js';
import { GoalRunStateError, parseGoalRunState } from './persistence.js';

const GOAL_DIR = path.join(WEASLEY_PODEX_HOME, 'goal');
const ACTIVE_RUN_PATH = path.join(GOAL_DIR, 'active-run.json');

let activeRun: GoalRunState | null = null;
let lastTrackingWarning: string | undefined;

function persistRun(): void {
    if (!activeRun) return;
    fs.mkdirSync(GOAL_DIR, { recursive: true });
    const tmp = ACTIVE_RUN_PATH + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(activeRun, null, 2));
    fs.renameSync(tmp, ACTIVE_RUN_PATH);
}

function deleteRunFile(): void {
    try { fs.unlinkSync(ACTIVE_RUN_PATH); } catch { /* file may not exist */ }
}

function loadRun(): void {
    if (activeRun) return;
    let data: string;
    try {
        data = fs.readFileSync(ACTIVE_RUN_PATH, 'utf8');
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            try { fs.lstatSync(ACTIVE_RUN_PATH); }
            catch (entryError) {
                if ((entryError as NodeJS.ErrnoException).code === 'ENOENT') {
                    lastTrackingWarning = undefined;
                    return;
                }
            }
        }
        throw new GoalRunStateError('the file could not be read; check its type and read permissions', 'goal_run_state_unreadable');
    }
    activeRun = parseGoalRunState(data);
    lastTrackingWarning = undefined;
}

function warnTracking(message: string): void {
    if (lastTrackingWarning !== message) console.warn(`[goal-run] ${message}`);
    lastTrackingWarning = message;
}

function loadRunForTracking(): boolean {
    try { loadRun(); return true; }
    catch (error) {
        if (!(error instanceof GoalRunStateError)) throw error;
        warnTracking(error.message);
        return false;
    }
}

const DEFAULT_BUDGET: GoalRunBudget = {
    maxTurns: 10,
    maxMinutes: 60,
    maxDispatches: 5,
    turnsUsed: 0,
    minutesUsed: 0,
    dispatchesUsed: 0,
};

export function getActiveRun(): GoalRunState | null {
    loadRun();
    return activeRun;
}

export function preflight(mode: GoalRunMode = 'assist'): GoalRunState {
    const goal = getActiveGoal();
    const gates = checkPreflightGates({
        hasGoal: goal?.status === 'active' && goal.goalMode !== 'plan',
        orcState: getState(),
        workerBusy: getActiveWorkers().length > 0,
        pendingReplay: hasPendingWorkerReplays(),
    });
    const budgetGate = checkBudget(DEFAULT_BUDGET);
    gates.push(budgetGate);
    try { loadRun(); }
    catch (error) {
        if (!(error instanceof GoalRunStateError)) throw error;
        gates.push({ gate: 'persisted-run-state', passed: false, reason: error.message });
    }

    return {
        goalId: goal?.id ?? '',
        mode,
        status: 'preflight',
        budget: { ...DEFAULT_BUDGET },
        gates,
    };
}

export function startRun(mode: GoalRunMode = 'assist'): GoalRunState {
    loadRun();
    const state = preflight(mode);
    if (activeRun) {
        state.gates.push({
            gate: 'no-active-run',
            passed: false,
            reason: 'A goal run already exists. Resume it or stop it before starting another.',
        });
    }
    if (!allGatesPassed(state.gates)) {
        state.status = 'failed';
        state.lastError = state.gates.filter(g => !g.passed).map(g => g.reason).join('; ');
        return state;
    }
    state.status = 'running';
    state.startedAt = new Date().toISOString();
    state.lastActiveAt = state.startedAt;
    activeRun = state;
    persistRun();
    return state;
}

export function pauseRun(): GoalRunState | null {
    loadRun();
    if (!activeRun || activeRun.status !== 'running') return null;
    accumulateMinutes();
    activeRun.status = 'paused';
    persistRun();
    return activeRun;
}

export function resumeRun(): GoalRunState | null {
    loadRun();
    if (!activeRun || activeRun.status !== 'paused') return null;
    const goal = getActiveGoal();
    const gates = checkPreflightGates({
        hasGoal: goal?.status === 'active' && goal.goalMode !== 'plan',
        orcState: getState(),
        workerBusy: getActiveWorkers().length > 0,
        pendingReplay: hasPendingWorkerReplays(),
    });
    const budgetGate = checkBudget(activeRun.budget);
    gates.push(budgetGate);
    gates.push({
        gate: 'same-goal',
        passed: goal?.id === activeRun.goalId,
        reason: goal?.id === activeRun.goalId ? undefined : 'The active goal has changed. Stop this run before starting one for the new goal.',
    });

    if (!allGatesPassed(gates)) {
        activeRun.gates = gates;
        activeRun.lastError = gates.filter(g => !g.passed).map(g => g.reason).join('; ');
        persistRun();
        return activeRun;
    }
    activeRun.status = 'running';
    activeRun.lastActiveAt = new Date().toISOString();
    activeRun.gates = gates;
    delete activeRun.lastError;
    persistRun();
    return activeRun;
}

export function stopRun(reason?: string): GoalRunState | null {
    loadRun();
    if (!activeRun) return null;
    accumulateMinutes();
    activeRun.status = 'stopped';
    activeRun.stoppedAt = new Date().toISOString();
    if (reason) activeRun.lastError = reason;
    const result = activeRun;
    activeRun = null;
    deleteRunFile();
    return result;
}

export function completeRun(): GoalRunState | null {
    loadRun();
    if (!activeRun) return null;
    accumulateMinutes();
    activeRun.status = 'completed';
    activeRun.stoppedAt = new Date().toISOString();
    const result = activeRun;
    activeRun = null;
    deleteRunFile();
    return result;
}

function accumulateMinutes(): void {
    if (activeRun?.status !== 'running' || !activeRun.lastActiveAt) return;
    const elapsed = (Date.now() - new Date(activeRun.lastActiveAt).getTime()) / 60_000;
    if (elapsed > 0) activeRun.budget.minutesUsed += elapsed;
    activeRun.lastActiveAt = new Date().toISOString();
}

function recordUsage(counter: 'turnsUsed' | 'dispatchesUsed'): void {
    if (!loadRunForTracking()) return;
    if (activeRun?.status === 'running') {
        if (activeRun.budget[counter] === Number.MAX_SAFE_INTEGER) {
            warnTracking(`${counter} reached the safe integer limit; tracking skipped and saved state unchanged.`);
            return;
        }
        accumulateMinutes();
        activeRun.budget[counter]++;
        persistRun();
    }
}

export function recordTurn(): void {
    recordUsage('turnsUsed');
}

export function recordDispatch(): void {
    recordUsage('dispatchesUsed');
}

export function handleFailure(phase: string, failureType: Parameters<typeof classifyFailure>[0]['failureType'], retryCount = 0) {
    const decision = classifyFailure({ phase, failureType, retryCount });
    if (!loadRunForTracking()) return decision;
    if (decision.action === 'stop' && activeRun) {
        stopRun(decision.reason);
    }
    return decision;
}
