import test from 'node:test';
import assert from 'node:assert/strict';

import {
    normalizeElicitationSpec,
    parseElicitationSpec,
    renderPlainElicitationSpec,
} from '../../src/shared/elicitation-spec.ts';

test('shared elicitation parser normalizes Web UI questions object', () => {
    const spec = parseElicitationSpec(JSON.stringify({
        questions: [{
            id: 'scope',
            type: 'checkbox',
            question: '무엇을 구현할까요?',
            options: [
                { id: 'tui', label: 'TUI', value: 'tui', description: '터미널 표면' },
                'Web AI fallback',
            ],
            visibleWhen: { mode: 'advanced' },
        }],
    }));

    assert.ok(spec);
    assert.equal(spec.questions[0]?.id, 'scope');
    assert.equal(spec.questions[0]?.type, 'multi_select');
    assert.equal(spec.questions[0]?.options[0]?.label, 'TUI');
    assert.equal(spec.questions[0]?.options[0]?.description, '터미널 표면');
    assert.equal(spec.questions[0]?.options[1]?.value, 'Web AI fallback');
    assert.deepEqual(spec.questions[0]?.visibleWhen, { mode: ['advanced'] });
});

test('shared elicitation parser accepts single-question choice-buttons shape', () => {
    const spec = normalizeElicitationSpec({
        question: '진행 방식은?',
        type: 'ranking',
        options: [{ text: '추천안', value: 'recommended' }],
    });

    assert.ok(spec);
    assert.equal(spec.questions.length, 1);
    assert.equal(spec.questions[0]?.type, 'rank_priorities');
    assert.equal(spec.questions[0]?.options[0]?.label, '추천안');
});

test('plain elicitation renderer includes numbered options and descriptions without raw JSON', () => {
    const spec = parseElicitationSpec(JSON.stringify({
        questions: [{
            question: '구현 범위는?',
            options: [{ label: 'Phase 41', description: '구조화 파서 공유' }],
        }],
    }));
    assert.ok(spec);

    const rendered = renderPlainElicitationSpec(spec, {
        intro: '구조화 질문:',
        includeDescriptions: true,
        multiQuestionPrefix: true,
    });

    assert.match(rendered, /구조화 질문:/);
    assert.match(rendered, /Q1\. 구현 범위는\?/);
    assert.match(rendered, /1\. Phase 41 — 구조화 파서 공유/);
    assert.doesNotMatch(rendered, /"questions"/);
});
