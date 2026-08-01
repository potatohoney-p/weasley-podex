import { createHash } from 'crypto';

export interface FrictionSignature {
  toolOrPhase: string;
  errorFingerprint: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
}

const ledger = new Map<string, FrictionSignature>();

function normalizeError(error: string): string {
  return error
    .toLowerCase()
    .replace(/\d+:\d+/g, 'L:C')
    .replace(/\/[\w/.-]+\//g, '.../')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}

export type FrictionVerdict = 'retry' | 'escalate' | 'stop';

export function recordFriction(tool: string, error: string): FrictionVerdict {
  const normalized = normalizeError(error);
  const hash = createHash('sha256').update(`${tool}:${normalized}`).digest('hex');
  const now = new Date().toISOString();

  const existing = ledger.get(hash);
  if (!existing) {
    ledger.set(hash, {
      toolOrPhase: tool,
      errorFingerprint: hash,
      count: 1,
      firstSeen: now,
      lastSeen: now,
    });
    return 'retry';
  }

  existing.count++;
  existing.lastSeen = now;

  if (existing.count >= 3) return 'stop';
  if (existing.count >= 2) return 'escalate';
  return 'retry';
}

export function resetFriction(): void {
  ledger.clear();
}

export function getFrictionSummary(): FrictionSignature[] {
  return Array.from(ledger.values())
    .filter(s => s.count >= 2)
    .sort((a, b) => b.count - a.count);
}

// P3-3: Oscillation detection (done→needs_fix→done→needs_fix)
const verdictHistory: string[] = [];

export function recordVerdict(verdict: string): void {
  verdictHistory.push(verdict);
  if (verdictHistory.length > 10) verdictHistory.shift();
}

export function detectOscillation(): boolean {
  if (verdictHistory.length < 4) return false;
  const last4 = verdictHistory.slice(-4);
  return last4[0] === last4[2] && last4[1] === last4[3] && last4[0] !== last4[1];
}

export function resetVerdictHistory(): void {
  verdictHistory.length = 0;
}
