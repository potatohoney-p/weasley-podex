// ── Media Lightbox — click inline image → modal popup, dblclick/button → open in browser ──

let lightboxInitialized = false;

export function initMediaLightbox(): void {
    // document-level listeners stack if init ever re-runs (260613 06).
    if (lightboxInitialized) return;
    lightboxInitialized = true;
    const overlay = document.createElement('div');
    overlay.id = 'mediaLightbox';
    overlay.className = 'media-lightbox hidden';
    overlay.innerHTML = `<div class="media-lightbox-backdrop"></div>
<div class="media-lightbox-content">
<img class="media-lightbox-img" alt="" />
<div class="media-lightbox-controls">
<button class="media-lightbox-open" aria-label="Open in browser">↗ Open</button>
<button class="media-lightbox-close" aria-label="Close">✕</button>
</div></div>`;
    document.body.appendChild(overlay);

    let currentSrc = '';

    const close = () => overlay.classList.add('hidden');
    const openInBrowser = () => { if (currentSrc) window.open(currentSrc, '_blank'); };

    overlay.querySelector('.media-lightbox-backdrop')!.addEventListener('click', close);
    overlay.querySelector('.media-lightbox-close')!.addEventListener('click', close);
    overlay.querySelector('.media-lightbox-open')!.addEventListener('click', openInBrowser);
    overlay.querySelector('.media-lightbox-img')!.addEventListener('dblclick', openInBrowser);

    // Escape key closes
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !overlay.classList.contains('hidden')) close();
    });

    // Delegate click on all inline images (chat + file preview)
    document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.classList.contains('chat-inline-img') || (target.closest('.file-preview-list') && target.tagName === 'IMG')) {
            currentSrc = (target as HTMLImageElement).src;
            (overlay.querySelector('.media-lightbox-img') as HTMLImageElement).src = currentSrc;
            overlay.classList.remove('hidden');
        }
    });
}
