import test from 'node:test';
import assert from 'node:assert/strict';

import { applyTemplate } from '../../public/manager/src/notes/template-engine.ts';

test('applyTemplate replaces title variable', () => {
    assert.equal(applyTemplate('# {{title}}', { title: 'My Note' }), '# My Note');
});

test('applyTemplate replaces multiple variables', () => {
    const result = applyTemplate('{{title}} on {{date}}', { title: 'Test' });
    assert.match(result, /^Test on \d{4}-\d{2}-\d{2}$/);
});

test('applyTemplate preserves unknown variables', () => {
    assert.equal(applyTemplate('{{unknown}} stays'), '{{unknown}} stays');
});

test('applyTemplate injects default date/time vars', () => {
    const now = new Date();
    const yyyy = String(now.getFullYear());
    const result = applyTemplate('Year: {{year}}');
    assert.equal(result, `Year: ${yyyy}`);
});

test('applyTemplate extra vars override defaults', () => {
    const result = applyTemplate('{{date}}', { date: '2099-01-01' });
    assert.equal(result, '2099-01-01');
});

test('applyTemplate handles empty template', () => {
    assert.equal(applyTemplate(''), '');
});

test('applyTemplate handles template with no variables', () => {
    assert.equal(applyTemplate('plain text'), 'plain text');
});

test('applyTemplate handles adjacent variables', () => {
    const result = applyTemplate('{{title}}{{title}}', { title: 'AB' });
    assert.equal(result, 'ABAB');
});
