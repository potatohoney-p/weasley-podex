// Permission policy evaluation — SDK-free.

import type { PermissionScope, PermissionLevel, WorkflowPermissionProfile } from './types.js';
import { DEFAULT_PROFILES } from './types.js';

export function createProfile(name: string, id?: string): WorkflowPermissionProfile {
    const rules = DEFAULT_PROFILES[name] ?? DEFAULT_PROFILES['read-only']!;
    return {
        id: id ?? `profile-${name}-${Date.now()}`,
        name,
        rules: [...rules],
        createdAt: new Date().toISOString(),
    };
}

export function checkPermission(
    profile: WorkflowPermissionProfile,
    scope: PermissionScope,
    target?: string,
): PermissionLevel {
    const rule = profile.rules.find(r => r.scope === scope);
    if (!rule) return 'deny';

    if (rule.level === 'ask' && rule.pattern && target) {
        const re = new RegExp(rule.pattern);
        return re.test(target) ? 'allow' : 'ask';
    }

    return rule.level;
}

export function isAllowed(
    profile: WorkflowPermissionProfile,
    scope: PermissionScope,
    target?: string,
): boolean {
    return checkPermission(profile, scope, target) === 'allow';
}
