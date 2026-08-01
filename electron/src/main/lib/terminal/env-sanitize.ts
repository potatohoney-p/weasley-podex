const STRIP_KEYS = new Set([
    'ELECTRON_RUN_AS_NODE',
    'ELECTRON_NO_ASAR',
    'NODE_OPTIONS',
    'NODE_REPL_HISTORY',
]);

const SECRET_PATTERNS = [
    /^OPENAI_/i,
    /^ANTHROPIC_/i,
    /^CLAUDE_/i,
    /^AWS_/i,
    /^AZURE_/i,
    /^GCP_/i,
    /^GOOGLE_/i,
    /^GITHUB_TOKEN$/i,
    /^GH_TOKEN$/i,
    /^GITLAB_TOKEN$/i,
    /^NPM_TOKEN$/i,
    /^NPM_AUTH_TOKEN$/i,
    /^DOCKER_PASSWORD$/i,
    /^DOCKER_TOKEN$/i,
    /_SECRET$/i,
    /_API_KEY$/i,
    /_ACCESS_KEY$/i,
    /_PRIVATE_KEY$/i,
    /^STRIPE_/i,
    /^TWILIO_/i,
    /^SENDGRID_/i,
    /^DATABASE_URL$/i,
    /^REDIS_URL$/i,
    /^MONGO_URI$/i,
];

function isSecretKey(key: string): boolean {
    return SECRET_PATTERNS.some(p => p.test(key));
}

export function sanitizeEnv(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
        if (v === undefined) continue;
        if (STRIP_KEYS.has(k)) continue;
        if (k.startsWith('ELECTRON_')) continue;
        if (isSecretKey(k)) continue;
        out[k] = v;
    }
    out['TERM'] = 'xterm-256color';
    out['COLORTERM'] = 'truecolor';
    return out;
}
