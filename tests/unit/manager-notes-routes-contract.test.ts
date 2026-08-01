import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const projectRoot = process.cwd();

function read(path: string): string {
    return readFileSync(join(projectRoot, path), 'utf8');
}

test('notes plugin asset route uses Express 5 named wildcard syntax', () => {
    const routes = read('src/manager/notes/routes.ts');

    assert.ok(
        routes.includes("router.get('/plugins/:id/asset/*assetPath'"),
        'plugin asset route must use a named wildcard for Express 5/path-to-regexp',
    );
    assert.ok(
        routes.includes("Array.isArray(rawAssetPath) ? rawAssetPath.join('/')"),
        'plugin asset route must normalize Express 5 wildcard segment arrays into a relative asset path',
    );
    assert.equal(
        routes.includes("router.get('/plugins/:id/asset/*'"),
        false,
        'plugin asset route must not use the unnamed wildcard syntax that crashes Express 5',
    );
});
