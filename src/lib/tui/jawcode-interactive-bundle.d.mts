export interface Component { render(width: number): string[]; }
export interface RecentSession { name: string; timeAgo: string; }
export interface LspServerInfo { name: string; status: 'ready' | 'error' | 'connecting'; fileTypes: string[]; }

export class WelcomeComponent implements Component {
    constructor(version: string, modelName: string, providerName: string, recentSessions?: RecentSession[], lspServers?: LspServerInfo[]);
    render(width: number): string[];
}

export class DynamicBorder implements Component {
    constructor(color?: (str: string) => string);
    render(width: number): string[];
}

export class BorderedLoader {
    constructor(tui: unknown, theme: unknown, message: string);
    get signal(): AbortSignal;
}

export class ComposerFooter implements Component {
    constructor(requestRender: () => void);
    render(width: number): string[];
}

export class UserMessageComponent {
    render(width: number): string[];
}

export class BranchSummaryMessageComponent {
    render(width: number): string[];
}

export class CompactionSummaryMessageComponent {
    render(width: number): string[];
}

export class CountdownTimer {
    constructor();
}

export class VisualTruncate {
    static truncate(text: string, maxWidth: number): string;
}

export function formatKeybindingHints(hints: Array<{ key: string; label: string }>): string;
export function createPabcdBorderCycle(requestRender: () => void): { stop(): void };
export function getPabcdBorderColor(phase: string): string;
export function isPabcdPhase(phase: string): boolean;

export interface ThemeColor { (text: string): string; }
export interface Theme {
    fg(color: string, text: string): string;
    bold(text: string): string;
    italic(text: string): string;
    boxSharp: { horizontal: string; vertical: string; topLeft: string; topRight: string; bottomLeft: string; bottomRight: string };
    getMarkdownTheme?(): Record<string, unknown>;
    icon: Record<string, string>;
}

export const theme: Theme;
export function initTheme(enableWatcher?: boolean): Promise<void>;
export function setThemeInstance(themeInstance: Theme): void;
