export interface WelcomeData {
    version: string;
    engine: string;
    engineAccent: string;
    model: string;
    directory: string;
    serverPort: number;
    gitBranch?: string;
    recentSessions?: Array<{ label: string; ago: string }>;
}

export interface AssistantData {
    text: string;
    thinking?: string;
    images?: string[];
    streaming: boolean;
    agentId?: string;
}

export interface ToolData {
    name: string;
    icon: string;
    args: string;
    result?: string;
    state: 'pending' | 'done' | 'error';
    elapsed?: string;
    depth?: number;
    isLast?: boolean;
}

export interface StatusData {
    model: string;
    engine: string;
    engineAccent: string;
    state: string;
    elapsed?: string;
    tokens?: number;
    cost?: number;
    bgtask?: number;
    gitBranch?: string;
    cwd?: string;
}

export interface BgtaskData {
    tasks: Array<{ id: string; kind: string; status: string; elapsed?: string }>;
}

export interface UserMessageData {
    text: string;
    displayText: string;
}
