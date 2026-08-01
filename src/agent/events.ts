// Legacy facade — explicit named re-exports only. No export *.
export {
    flushClaudeBuffers,
    flushOpenCodeBuffers,
    extractSessionId,
    extractOutputChunk,
    extractFromEvent,
    logEventSummary,
    summarizeToolInput,
    extractToolLabel,
    extractToolLabelsForTest,
    makeClaudeToolKeyForTest,
    extractFromAcpUpdate,
    extractFromAcpSubagent,
} from './events/index.js';
