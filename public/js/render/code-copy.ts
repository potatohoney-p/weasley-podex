// ── Copy button event delegation ──
import { copyText } from '../features/copy-text.js';
import { t } from '../features/i18n.js';

// ── Copy button event delegation (one-time setup) ──
let codeCopyDelegationReady = false;

function copyCodeAndFlash(target: HTMLElement, code: string): void {
    void copyText(code).then(result => {
        if (!result.ok) return;
        const orig = target.textContent || '';
        target.textContent = t('code.copied');
        target.classList.add('copied');
        setTimeout(() => {
            target.textContent = orig;
            target.classList.remove('copied');
        }, 1500);
    });
}

export function ensureCodeCopyDelegation(): void {
    if (codeCopyDelegationReady) return;
    codeCopyDelegationReady = true;
    document.addEventListener('click', (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        // New structure: .code-copy-btn inside .code-block
        const copyBtn = target?.closest('.code-copy-btn') as HTMLElement | null;
        if (copyBtn) {
            const block = copyBtn.closest('.code-block');
            if (!block) return;
            const codeEl = block.querySelector('pre code');
            if (!codeEl) return;
            copyCodeAndFlash(copyBtn, codeEl.textContent || '');
            return;
        }
        // Legacy structure: .code-lang-label inside .code-block-wrapper
        const label = target?.closest('.code-lang-label') as HTMLElement | null;
        if (!label) return;
        const wrapper = label.closest('.code-block-wrapper');
        if (!wrapper) return;
        const codeEl = wrapper.querySelector('pre code');
        if (!codeEl) return;
        copyCodeAndFlash(label, codeEl.textContent || '');
    });
}
