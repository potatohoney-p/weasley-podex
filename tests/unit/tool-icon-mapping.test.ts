import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hasIconMapping, ICONS, resolveIcon } from '../../public/js/icons.ts';

const root = join(import.meta.dirname, '../..');

function assertSvg(value: string, message: string): void {
    const resolved = resolveIcon(value);
    assert.match(resolved, /^<svg\b/, message);
    assert.notEqual(resolved, value, `${message}: must not render raw value`);
}

test('runtime tool icon gaps resolve to library SVG icons', () => {
    for (const value of ['tool', 'robot', '💬', '❔', '⏹️', '🔐', '📖', '💻']) {
        assert.equal(hasIconMapping(value), true, `${value} must be explicitly mapped`);
        assertSvg(value, `${value} must resolve to an SVG icon`);
    }
});

test('skills_ref registry emojis are all explicitly mapped to library icons', () => {
    const registryPath = join(root, 'skills_ref/registry.json');
    if (!existsSync(registryPath)) return;

    const registry = JSON.parse(readFileSync(registryPath, 'utf8')) as {
        skills?: Record<string, { emoji?: string }>;
    };
    const missing: string[] = [];
    const raw: string[] = [];

    for (const [id, skill] of Object.entries(registry.skills || {})) {
        const emoji = skill.emoji;
        if (!emoji) continue;
        if (!hasIconMapping(emoji)) missing.push(`${id}:${emoji}`);
        const resolved = resolveIcon(emoji);
        if (!resolved.startsWith('<svg')) raw.push(`${id}:${emoji}`);
    }

    assert.deepEqual(missing, [], 'every skills_ref registry emoji must have an explicit mapping');
    assert.deepEqual(raw, [], 'skills_ref registry emojis must render SVG icons, not raw emoji');
});

test('unknown icon values use library fallback instead of raw text', () => {
    assert.equal(hasIconMapping('not-a-real-icon'), false);
    assert.equal(resolveIcon('not-a-real-icon'), ICONS.tool);
});
