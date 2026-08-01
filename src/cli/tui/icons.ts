const NERD_SHARK = '\u{F0027}';
const EMOJI_SHARK = '\u{1F988}';

let _useNerd: boolean | null = null;

function detectNerdFont(): boolean {
    const term = process.env['TERM_PROGRAM'] || '';
    const font = process.env['NERD_FONT'] || '';
    if (font === '1' || font.toLowerCase() === 'true') return true;
    if (font === '0' || font.toLowerCase() === 'false') return false;
    const nerdTerms = ['WezTerm', 'Alacritty', 'kitty', 'iTerm.app', 'iTerm2'];
    return nerdTerms.some(t => term.includes(t));
}

export function sharkIcon(): string {
    if (_useNerd === null) _useNerd = detectNerdFont();
    return _useNerd ? NERD_SHARK : EMOJI_SHARK;
}

export function setNerdFontMode(enabled: boolean): void {
    _useNerd = enabled;
}
