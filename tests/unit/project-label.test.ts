import test from 'node:test';
import assert from 'node:assert/strict';
import { formatProjectLabel } from '../../public/js/features/project-label.ts';

test('PJL-001: null/empty dirs hide the label', () => {
    assert.equal(formatProjectLabel(null), null);
    assert.equal(formatProjectLabel(undefined), null);
    assert.equal(formatProjectLabel([]), null);
    assert.equal(formatProjectLabel(['', '   ']), null);
});

test('PJL-002: short path renders as-is with home abbreviation', () => {
    const label = formatProjectLabel(['/Users/jun/repo']);
    assert.ok(label);
    assert.equal(label.text, '~/repo');
    assert.equal(label.title, '/Users/jun/repo');
});

test('PJL-003: linux home is abbreviated too', () => {
    const label = formatProjectLabel(['/home/jun/repo']);
    assert.ok(label);
    assert.equal(label.text, '~/repo');
});

test('PJL-004: long path gets middle ellipsis keeping head and last segment', () => {
    const label = formatProjectLabel(['/Users/jun/Developer/new/700_projects/podex']);
    assert.ok(label);
    assert.equal(label.text, '~/Developer/…/podex');
    assert.equal(label.title, '/Users/jun/Developer/new/700_projects/podex');
});

test('PJL-005: multiple dirs add a +N badge and full title list', () => {
    const label = formatProjectLabel(['/Users/jun/a', '/Users/jun/b', '/Users/jun/c']);
    assert.ok(label);
    assert.equal(label.text, '~/a +2');
    assert.equal(label.title, '/Users/jun/a\n/Users/jun/b\n/Users/jun/c');
});

test('PJL-006: non-home long path still ellipsizes', () => {
    const label = formatProjectLabel(['/opt/very/long/path/to/some/deep/project-dir']);
    assert.ok(label);
    assert.equal(label.text, '/opt/…/project-dir');
});

