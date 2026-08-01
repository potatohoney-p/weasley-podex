// Type-only re-export boundary for events/ adapters. No runtime code.

import type { CliEventRecord } from '../../types/cli-events.js';
import type { SpawnContext } from '../../types/agent.js';

export type {
    CliEventRecord,
    AcpUpdateParams,
    AcpSubagentEvent,
    ExtractedEventResult,
} from '../../types/cli-events.js';

export type {
    SpawnContext,
    ToolEntry,
} from '../../types/agent.js';

export type EventAdapter = (
    event: CliEventRecord,
    ctx: SpawnContext,
    agentLabel: string,
    empTag: Record<string, unknown>,
) => void;
