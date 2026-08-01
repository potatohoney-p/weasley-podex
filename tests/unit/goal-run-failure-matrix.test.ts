import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyFailure } from '../../src/goal-run/failure-matrix.ts';

describe('Goal Run Failure Matrix', () => {
    test('1. audit-fail returns follow-up-plan', () => {
        const d = classifyFailure({ phase: 'A', failureType: 'audit-fail', retryCount: 0 });
        assert.equal(d.action, 'follow-up-plan');
    });

    test('2. test-fail first time returns retry', () => {
        const d = classifyFailure({ phase: 'C', failureType: 'test-fail', retryCount: 0 });
        assert.equal(d.action, 'retry');
    });

    test('3. test-fail after retries returns stop', () => {
        const d = classifyFailure({ phase: 'C', failureType: 'test-fail', retryCount: 2 });
        assert.equal(d.action, 'stop');
    });

    test('4. dispatch-fail first time returns retry', () => {
        const d = classifyFailure({ phase: 'A', failureType: 'dispatch-fail', retryCount: 0 });
        assert.equal(d.action, 'retry');
    });

    test('5. dispatch-fail after retry returns ask', () => {
        const d = classifyFailure({ phase: 'A', failureType: 'dispatch-fail', retryCount: 1 });
        assert.equal(d.action, 'ask');
    });

    test('6. type-error always stops', () => {
        const d = classifyFailure({ phase: 'B', failureType: 'type-error', retryCount: 0 });
        assert.equal(d.action, 'stop');
    });

    test('7. timeout always stops', () => {
        const d = classifyFailure({ phase: 'B', failureType: 'timeout', retryCount: 0 });
        assert.equal(d.action, 'stop');
    });

    test('8. unknown failure stops', () => {
        const d = classifyFailure({ phase: 'P', failureType: 'unknown', retryCount: 0 });
        assert.equal(d.action, 'stop');
    });
});
