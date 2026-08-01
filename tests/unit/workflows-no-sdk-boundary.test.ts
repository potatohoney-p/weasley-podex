import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readdirSync, readFileSync, existsSync } from 'node:fs';

const __dirname = import.meta.dirname;
const projectRoot = join(__dirname, '../..');

const SDK_IMPORT_RE = /from\s+['"](openai|@openai\/agents|@anthropic-ai\/sdk|@google\/generative-ai|@google\/genai|@ai-sdk\/[^'"]+|ai)['"]/;
const ENV_RE = /\b(MODEL_ADAPTER_[A-Z_]+|AI_SDK_[A-Z_]+)\b/;

function scanDirectory(dirAbs: string): Array<{ file: string; hit: string }> {
    const violations: Array<{ file: string; hit: string }> = [];
    if (!existsSync(dirAbs)) return violations;
    function walk(dir: string) {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
            const abs = join(dir, entry.name);
            if (entry.isDirectory()) { walk(abs); continue; }
            if (!/\.(ts|tsx|js|mjs)$/.test(entry.name)) continue;
            const text = readFileSync(abs, 'utf8');
            if (SDK_IMPORT_RE.test(text)) violations.push({ file: abs, hit: 'SDK import' });
            if (ENV_RE.test(text)) violations.push({ file: abs, hit: 'forbidden env var' });
        }
    }
    walk(dirAbs);
    return violations;
}

test('NSDK-001: src/workflows/ has no SDK imports', () => {
    const v = scanDirectory(join(projectRoot, 'src/workflows'));
    assert.deepEqual(v, [], v.map(x => `${x.file}: ${x.hit}`).join('; '));
});

test('NSDK-002: src/goal/ has no SDK imports', () => {
    const v = scanDirectory(join(projectRoot, 'src/goal'));
    assert.deepEqual(v, [], v.map(x => `${x.file}: ${x.hit}`).join('; '));
});

test('NSDK-003: src/goal-run/ has no SDK imports', () => {
    const v = scanDirectory(join(projectRoot, 'src/goal-run'));
    assert.deepEqual(v, [], v.map(x => `${x.file}: ${x.hit}`).join('; '));
});

test('NSDK-004: src/team/ has no SDK imports (when it exists)', () => {
    const dir = join(projectRoot, 'src/team');
    if (!existsSync(dir)) return;
    const v = scanDirectory(dir);
    assert.deepEqual(v, [], v.map(x => `${x.file}: ${x.hit}`).join('; '));
});

test('NSDK-005: public/js/ has no SDK imports', () => {
    const v = scanDirectory(join(projectRoot, 'public/js'));
    assert.deepEqual(v, [], v.map(x => `${x.file}: ${x.hit}`).join('; '));
});

test('NSDK-006: no forbidden model-adapter paths exist', () => {
    const forbidden = [
        'src/workflows/model-adapter',
        'src/goal/model-adapter',
        'src/goal-run/model-adapter',
        'src/team/model-adapter',
        'src/model-adapter',
        'src/browser/web-ai/model-adapter',
    ];
    for (const p of forbidden) {
        assert.ok(!existsSync(join(projectRoot, p)), `forbidden path exists: ${p}`);
    }
});

test('NSDK-007: gate script exists in release-gates.mjs', () => {
    const src = readFileSync(join(projectRoot, 'scripts/release-gates.mjs'), 'utf8');
    assert.ok(src.includes('workflow-common-layer-no-sdk'), 'gate must be defined');
});

test('NSDK-008: gate script registered in package.json', () => {
    const pkg = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'));
    assert.ok(pkg.scripts?.['gate:workflow-common-layer-no-sdk'], 'gate script must exist');
});
