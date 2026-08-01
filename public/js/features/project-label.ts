// ─── Project header label (#233) ─────────────────────
// Pure formatting for the chat-header "Project …" segment. Kept free of DOM
// so unit tests can cover the abbreviation rules directly.

const HOME_PREFIX_RE = /^\/(?:Users|home)\/[^/]+/;
const MAX_LABEL_LENGTH = 32;

export type ProjectLabel = {
    /** Display text, e.g. "~/Developer/…/weasley-podex +2" */
    text: string;
    /** Full untruncated paths for the title/tooltip attribute. */
    title: string;
};

function abbreviateHome(dir: string): string {
    return dir.replace(HOME_PREFIX_RE, '~');
}

function ellipsizeMiddle(dir: string): string {
    if (dir.length <= MAX_LABEL_LENGTH) return dir;
    const segments = dir.split('/');
    if (segments.length <= 3) return dir; // "~/x/verylongname" — nothing to elide
    const head = segments.slice(0, 2).join('/');
    const tail = segments[segments.length - 1];
    return `${head}/…/${tail}`;
}

/** null → hide the header segment entirely. */
export function formatProjectLabel(dirs: readonly string[] | null | undefined): ProjectLabel | null {
    const list = (dirs || []).filter(d => typeof d === 'string' && d.trim());
    if (list.length === 0) return null;
    const first = ellipsizeMiddle(abbreviateHome(list[0]));
    const extra = list.length > 1 ? ` +${list.length - 1}` : '';
    return {
        text: `${first}${extra}`,
        title: list.join('\n'),
    };
}

