import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Pi settings routes use registration validation, applySettings, and redaction', () => {
    const source = readFileSync('src/routes/settings.ts', 'utf8');
    assert.match(source, /app\.post\('\/api\/pi\/profiles\/register'/);
    assert.match(source, /normalizePiProfile\(req\.body\)/);
    assert.match(source, /await listPiModels\(nextPi, profile\.id\)/);
    assert.match(source, /models\.includes\(profile\.model\)/);
    assert.match(source, /await applySettings\(\{/);
    assert.match(source, /redactPiSettings/);
});

test('Pi model route discovers models from the selected profile', () => {
    const source = readFileSync('src/routes/settings.ts', 'utf8');
    assert.match(source, /app\.get\('\/api\/pi\/models'/);
    assert.match(source, /normalizePiSettings\(settings\["pi"\]\)\.defaultProfileId/);
    assert.match(source, /await listPiModels\(settings\["pi"\], profile\)/);
});
