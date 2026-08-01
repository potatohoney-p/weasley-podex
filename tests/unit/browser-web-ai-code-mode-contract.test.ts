import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSource } from './source-normalize.js';
import { extractConversationId } from '../../src/browser/web-ai/code-mode.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const codeModeSrc = readSource(join(root, 'src/browser/web-ai/code-mode.ts'), 'utf8');
const chatgptSrc = readSource(join(root, 'src/browser/web-ai/chatgpt.ts'), 'utf8');
const routeSrc = readSource(join(root, 'src/routes/browser.ts'), 'utf8');

test('code mode extracts ChatGPT conversation ids from urls and bare ids', () => {
    assert.equal(extractConversationId('https://chatgpt.com/c/6a29932e-4848-83aa-871b-3850096c0224'), '6a29932e-4848-83aa-871b-3850096c0224');
    assert.equal(extractConversationId('6a29932e-4848-83aa-871b-3850096c0224'), '6a29932e-4848-83aa-871b-3850096c0224');
    assert.equal(extractConversationId('https://chatgpt.com/'), null);
    assert.equal(extractConversationId(null), null);
});

test('code mode attaches the dev-agent context zip on first turns only and requires plans on new artifacts', () => {
    // First turn: attach the context zip; continuation (--url/--conversation/--session)
    // skips it unless contextRefresh forces a re-upload (sandbox /mnt persists).
    assert.match(codeModeSrc, /const attachContext = !continuation \|\| input\.contextRefresh === true/);
    assert.match(codeModeSrc, /const contextZip = attachContext \? await ensureCodeDevContextZip\(\) : null/);
    assert.match(codeModeSrc, /const filePaths = \[\.\.\.\(contextZip \? \[contextZip\.path\] : \[\]\), \.\.\.callerFilePaths\]/);
    assert.match(codeModeSrc, /attachmentPolicy: filePaths\.length \? 'upload' : 'inline-only'/);
    assert.match(codeModeSrc, /buildCodeModePrompt\(String\(input\.prompt \|\| ''\), \{ multiZip: input\.multiZip === true \}\)/);
    assert.match(codeModeSrc, /retrieveCodeArtifact\(page as unknown as PageLike, \{ conversationId, outputPath, requirePlan: true \}\)/);
    assert.match(codeModeSrc, /retrieveAllCodeArtifacts\(page as unknown as PageLike, \{ conversationId, outputDir, requirePlan: true \}\)/);
    assert.match(codeModeSrc, /codeContextAttached: attachContext/);
});

test('code extract reuses conversation text later without requiring plan artifacts', () => {
    assert.match(codeModeSrc, /extractCodeArtifacts/);
    assert.match(codeModeSrc, /conversationRef = input\.conversation \|\| input\.url \|\| session\?\.conversationUrl \|\| session\?\.url \|\| pageUrl/);
    assert.match(codeModeSrc, /retrieveCodeArtifact\(page as unknown as PageLike, \{ conversationId, outputPath, requirePlan: false \}\)/);
    assert.match(codeModeSrc, /retrieveAllCodeArtifacts\(page as unknown as PageLike, \{ conversationId, outputDir, requirePlan: false \}\)/);
});

test('chatgpt send supports multiple live file uploads in caller order', () => {
    assert.match(chatgptSrc, /const requestedPaths = Array\.isArray\(input\.filePaths\) && input\.filePaths\.length/);
    assert.match(chatgptSrc, /const uploadPaths = requestedPaths\.length \? requestedPaths : \(contextAttachmentPath \? \[contextAttachmentPath\] : \[\]\)/);
    assert.match(chatgptSrc, /for \(const uploadPath of uploadPaths\)/);
    assert.match(chatgptSrc, /attachLocalFileLive\(page, info\)/);
    assert.match(chatgptSrc, /verifySentTurnAttachmentLive\(page, localFileInfo\(uploadPath\)\)/);
});

test('code mode HTTP routes are wired to browser web-ai module', () => {
    assert.match(routeSrc, /\/api\/browser\/web-ai\/code', requireAuth/);
    assert.match(routeSrc, /browser\.webAi\.codeWebAi\(cdpPort\(req\), req\.body\)/);
    assert.match(routeSrc, /\/api\/browser\/web-ai\/code-extract', requireAuth/);
    assert.match(routeSrc, /browser\.webAi\.extractCodeArtifacts\(cdpPort\(req\), req\.body\)/);
});
