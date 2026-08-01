export function isClaudeLikeCli(cli: string): boolean {
    return cli === 'ai-e'
        || cli === 'claude'
        || cli === 'claude-e';
}

export function isSessionPersistingCli(cli: string): boolean {
    return cli !== 'claude' && cli !== 'agy';
}
