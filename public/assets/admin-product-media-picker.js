'use strict';
(() => {
  function selectedProductImageUrl() {
    const primary = (currentImages || []).find((image) => image.role === 'primary');
    return primary?.url || currentImages?.[0]?.url || '';
  }

  function assignMediaToProduct(media) {
    if (!media?.url) return;
    const existing = (currentImages || []).find((image) => image.id === media.id || image.url === media.url);
    if (existing) {
      setMessage($('#productStatusMessage'), 'That Media Library image is already assigned to this product.', true);
      return;
    }

    const role = (currentImages || []).some((image) => image.role === 'primary') ? 'gallery' : 'primary';
    currentImages.push({
      id: media.id || `media-${Date.now()}`,
      url: media.url,
      alt: media.alt || media.title || media.filename || '',
      role,
      displayOrder: currentImages.length + 1
    });
    renderImages();
    setMessage($('#productStatusMessage'), `Media Library image added as ${role}. Save the product to keep the change.`, true);
  }

  function openProductMediaPicker() {
    if (typeof window.openGlobalMediaPicker !== 'function') {
      setMessage($('#productStatusMessage'), 'The Media Library picker is unavailable. Refresh the administrator page and try again.');
      return;
    }
    window.openGlobalMediaPicker({
      title: 'Select product image',
      current: selectedProductImageUrl(),
      onSelect: assignMediaToProduct
    });
  }

  function installProductMediaPicker() {
    const addUrlButton = $('#addImageUrl');
    if (!addUrlButton || $('#selectProductMedia')) return;

    const actions = document.createElement('div');
    actions.className = 'flex flex-wrap gap-2';
    const selectButton = document.createElement('button');
    selectButton.id = 'selectProductMedia';
    selectButton.type = 'button';
    selectButton.className = 'bg-amber-400 text-slate-950 px-4 py-2 rounded-xl font-bold';
    selectButton.textContent = 'SELECT FROM MEDIA';
    selectButton.addEventListener('click', openProductMediaPicker);

    addUrlButton.replaceWith(actions);
    actions.append(selectButton, addUrlButton);
  }

  installProductMediaPicker();
})();
