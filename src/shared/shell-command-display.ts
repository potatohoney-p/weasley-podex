const SHELL_WRAPPER_RE = /^(?:(?:\/[^\s]+\/)?(?:bash|zsh|sh))\s+-lc\s+([\s\S]+)$/;

function unquoteShellArg(value: string): string {
    const trimmed = value.trim();
    if (trimmed.length < 2) return trimmed;
    const quote = trimmed[0];
    if (quote !== '\'' && quote !== '"') return trimmed;
    const hasClosingQuote = trimmed[trimmed.length - 1] === quote;
    const inner = hasClosingQuote ? trimmed.slice(1, -1) : trimmed.slice(1);
    if (quote === '\'') return inner.replace(/'\\''/g, '\'');
    return inner
        .replace(/\\"/g, '"')
        .replace(/\\`/g, '`')
        .replace(/\\\$/g, '$')
        .replace(/\\\\/g, '\\');
}

export function unwrapShellLoginCommand(command: string): string {
    const raw = String(command || '').trim();
    if (!raw) return '';
    const match = raw.match(SHELL_WRAPPER_RE);
    if (!match) return raw;
    const unwrapped = unquoteShellArg(match[1] || '');
    return unwrapped || raw;
}

export function displayShellCommand(command: string): string {
    return unwrapShellLoginCommand(command);
}

export function displayShellCommandDetail(detail: string): string {
    const raw = String(detail || '');
    if (!raw.trim()) return '';
    const lines = raw.split(/\r?\n/);
    const first = lines[0] || '';
    const prompt = first.match(/^(\s*\$\s*)([\s\S]+)$/);
    if (prompt) {
        const pretty = displayShellCommand(prompt[2] || '');
        lines[0] = `${prompt[1]}${pretty}`;
        return lines.join('\n');
    }
    const pretty = displayShellCommand(first);
    if (pretty !== first.trim()) {
        lines[0] = pretty;
        return lines.join('\n');
    }
    return raw;
}
