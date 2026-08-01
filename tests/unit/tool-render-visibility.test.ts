import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const uiSrc = readFileSync(join(__dirname, '../../public/js/ui.ts'), 'utf8');
const processBlockSrc = readFileSync(join(__dirname, '../../public/js/features/process-block.ts'), 'utf8');
const processBlockDomSrc = readFileSync(join(__dirname, '../../public/js/features/process-block-dom.ts'), 'utf8');

test('live process blocks stay before message content so the tool window does not move below the answer', () => {
    const showIdx = uiSrc.indexOf('export function showProcessStep');
    const hydrateIdx = uiSrc.indexOf('export function hydrateActiveRun');
    const appendIdx = uiSrc.indexOf('export function appendAgentText');
    const showBlock = uiSrc.slice(showIdx, hydrateIdx);
    const hydrateBlock = uiSrc.slice(hydrateIdx, appendIdx);

    assert.ok(showBlock.includes('normalizeAgentToolBlocks(agentDiv)'), 'live agent_tool events should keep canonical tool placement');
    assert.ok(showBlock.includes('createProcessBlock(body)'), 'new live process blocks should mount before streamed content');
    assert.ok(hydrateBlock.includes('normalizeAgentToolBlocks(state.currentAgentDiv)'), 'active-run hydration should keep canonical tool placement');
    assert.ok(hydrateBlock.includes('createProcessBlock(body)'), 'rehydrated active-run tools should mount before streamed content');
    assert.ok(!showBlock.includes('after-content'), 'live tool placement must not move below the answer');
    assert.ok(!hydrateBlock.includes('after-content'), 'rehydrated tool placement must not move below the answer');
});

test('finalized process blocks still normalize before content for historical messages', () => {
    const finalizeIdx = uiSrc.indexOf('export function finalizeAgent');
    const finalizeBlock = uiSrc.slice(finalizeIdx, finalizeIdx + 1800);

    assert.ok(finalizeBlock.includes('normalizeAgentToolBlocks(state.currentAgentDiv)'), 'finalize should use the default historical placement');
    assert.ok(!finalizeBlock.includes('after-content'), 'finalized messages should not use bottom placement');
});

test('process block helpers keep the canonical before-content placement', () => {
    assert.ok(processBlockSrc.includes('if (content) content.before(el);'), 'createProcessBlock should put the tool block before message content');
    assert.ok(!processBlockSrc.includes('content.after(el)'), 'createProcessBlock should not put the tool block below message content');

    assert.ok(processBlockDomSrc.includes('body.insertBefore(keep, content)'), 'DOM normalizer should move stray tool blocks before message content');
    assert.ok(!processBlockDomSrc.includes('after-content'), 'DOM normalizer should not preserve bottom placement');
});
