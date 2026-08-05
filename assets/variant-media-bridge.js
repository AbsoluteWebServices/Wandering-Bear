// Bridges native variant changes to the swiper media gallery on the misc/simple PDP.
// Only runs when a native-wired picker is present, i.e. the misc/simple template.

function initVariantMediaBridge() {
  const picker = document.querySelector('variant-picker[data-native-wiring="true"]');
  if (!picker) return;

  window.addEventListener('variant-changed', () => {
    const checked = picker.querySelector('input[data-variant-id]:checked');
    if (!checked) return;

    const position = parseInt(checked.dataset.featuredMediaPosition || '', 10);
    if (!position) return;

    window.dispatchEvent(new CustomEvent('gallery-slide-to', { detail: { position } }));
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initVariantMediaBridge, { once: true });
} else {
  initVariantMediaBridge();
}
