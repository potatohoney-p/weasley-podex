import test from 'node:test';
import assert from 'node:assert/strict';

import { renderMarkdown } from '../../src/cli/tui/markdown.ts';
import { visualWidth } from '../../src/cli/tui/renderers.ts';

function stripAnsi(text: string): string {
    return text.replace(/\x1b\[[0-9;]*m/g, '');
}

test('TUI markdown renders elicitation fences as wrapped numbered questions', () => {
    const spec = JSON.stringify({
        questions: [{
            question: 'Phase 41에서 무엇을 우선 구현할까요?',
            options: [
                { label: '공유 parser', description: 'Web UI와 TUI가 같은 구조를 사용' },
                { label: 'remote fallback', description: 'Telegram/Discord에서는 번호형 텍스트' },
            ],
        }],
    });

    const rendered = stripAnsi(renderMarkdown(`\`\`\`elicitation\n${spec}\n\`\`\``, {
        width: 48,
        gutter: '  ',
    }));

    assert.match(rendered, /구조화 질문:/);
    assert.match(rendered, /Q1\. Phase 41에서 무엇을 우선 구현할까요\?/);
    assert.match(rendered, /1\. 공유 parser/);
    assert.match(rendered, /2\. remote fallback/);
    assert.doesNotMatch(rendered, /"questions"/);
    for (const row of rendered.split('\n').filter(Boolean)) {
        assert.ok(visualWidth(row) <= 50, `row should fit width: ${row}`);
    }
});

test('TUI markdown fails closed for malformed elicitation fences', () => {
    const rendered = stripAnsi(renderMarkdown('```choice-buttons\nnot-json\n```', {
        width: 60,
        gutter: '  ',
    }));

    assert.match(rendered, /\[구조화 질문 형식을 읽을 수 없습니다\]/);
    assert.doesNotMatch(rendered, /not-json/);
});
