import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Test the CJK detection logic directly (extracted for unit testing)
const CJK_RE = /[\u4E00-\u9FFF\u3400-\u4DBF\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/;

function containsCJK(text: string): boolean {
    return CJK_RE.test(text);
}

function countCJKChars(text: string): number {
    let n = 0;
    for (const ch of text) { if (CJK_RE.test(ch)) n++; }
    return n;
}

describe('CJK detection helpers', () => {
    it('detects Korean text', () => {
        assert.ok(containsCJK('프로젝트설계'));
        assert.equal(countCJKChars('프로젝트설계'), 6);
    });

    it('detects Japanese text', () => {
        assert.ok(containsCJK('データベース'));
        assert.equal(countCJKChars('データベース'), 6);
    });

    it('does not detect pure English', () => {
        assert.ok(!containsCJK('memory indexing'));
        assert.equal(countCJKChars('memory indexing'), 0);
    });

    it('detects mixed CJK/Latin', () => {
        assert.ok(containsCJK('React 컴포넌트'));
        assert.equal(countCJKChars('React 컴포넌트'), 4);
    });

    it('detects single Korean char', () => {
        assert.ok(containsCJK('메'));
        assert.equal(countCJKChars('메'), 1);
    });

    it('detects Hangul Jamo', () => {
        assert.ok(containsCJK('\u1100')); // ᄀ
        assert.ok(containsCJK('\u3131')); // ㄱ
    });
});

describe('CJK routing logic', () => {
    it('Korean >= 3 chars routes to trigram-primary', () => {
        const query = '프로젝트설계';
        assert.ok(containsCJK(query));
        assert.ok(countCJKChars(query) >= 3, 'should route to trigram-primary');
    });

    it('Short CJK < 3 chars routes to LIKE fallback', () => {
        const query = '메모';
        assert.ok(containsCJK(query));
        assert.ok(countCJKChars(query) < 3, 'should route to LIKE fallback');
    });

    it('English routes to standard BM25+RRF', () => {
        const query = 'memory optimization';
        assert.ok(!containsCJK(query), 'should route to standard path');
    });
});
