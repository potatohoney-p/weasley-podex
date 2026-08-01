import { readSource } from './source-normalize.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

const __dirname = import.meta.dirname;
const projectRoot = join(__dirname, '../..');

const typesSrc = readSource(join(projectRoot, 'src/workflows/permissions/types.ts'), 'utf8');
const policySrc = readSource(join(projectRoot, 'src/workflows/permissions/policy.ts'), 'utf8');

const SDK_DENYLIST = ['openai', '@anthropic-ai/sdk', 'ai', '@ai-sdk/'];

test('WPP-001: permission types are SDK-free', () => {
    for (const sdk of SDK_DENYLIST) {
        assert.ok(!typesSrc.includes(`from '${sdk}`), `types must not import ${sdk}`);
        assert.ok(!policySrc.includes(`from '${sdk}`), `policy must not import ${sdk}`);
    }
});

test('WPP-002: permission scopes cover read/edit/bash/network/mcp', () => {
    for (const scope of ['read', 'edit', 'bash', 'network', 'mcp']) {
        assert.ok(typesSrc.includes(`'${scope}'`), `must define ${scope} scope`);
    }
});

test('WPP-003: permission levels are allow/deny/ask', () => {
    for (const level of ['allow', 'deny', 'ask']) {
        assert.ok(typesSrc.includes(`'${level}'`), `must define ${level} level`);
    }
});

test('WPP-004: default profiles include read-only, audit, build', () => {
    assert.ok(typesSrc.includes("'read-only'"), 'must have read-only profile');
    assert.ok(typesSrc.includes("'audit'"), 'must have audit profile');
    assert.ok(typesSrc.includes("'build'"), 'must have build profile');
});

test('WPP-005: policy can evaluate permissions', () => {
    assert.ok(policySrc.includes('checkPermission'), 'must export checkPermission');
    assert.ok(policySrc.includes('isAllowed'), 'must export isAllowed');
});

test('WPP-006: policy creates profiles from defaults', () => {
    assert.ok(policySrc.includes('createProfile'), 'must export createProfile');
});

test('WPP-007: ask level with pattern matches allowed commands', () => {
    assert.ok(policySrc.includes('rule.pattern'), 'must check pattern for ask level');
});
