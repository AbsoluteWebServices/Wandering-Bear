// Gift card template: start with NO amount pre-selected — the shopper must actively pick a
// denomination before the gift card can be added to cart.
// Loaded only on the gift-card template (see buy-buttons.liquid).

const PLACEHOLDER = '-';

function noAmountSelected(form) {
  const idInput = form.querySelector('input[name="id"]');
  return !idInput || !idInput.value;
}

function guardSubmit(form) {
  const idInput = form.querySelector('input[name="id"]');
  if (idInput) idInput.value = '';

  const enforce = () => {
    const button =
      form.querySelector('.gvlo-gift-card-trigger') || form.querySelector('[ref="addToCartButton"]');
    if (button && !button.disabled && noAmountSelected(form)) {
      button.disabled = true;
    }
  };

  enforce();
  new MutationObserver(enforce).observe(form, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['disabled'],
  });
}

function clearDefaultSelection() {
  const picker = document.querySelector('variant-picker');
  if (!picker) return;

  picker.querySelectorAll('input[type="radio"]').forEach((radio) => {
    radio.checked = false;
    radio.dataset.currentChecked = 'false';
  });

  picker.querySelectorAll('[data-variant-select-option]').forEach((option, index) => {
    option.setAttribute('aria-selected', 'false');
    option.setAttribute('tabindex', index === 0 ? '0' : '-1');
  });

  const valueEl = picker.querySelector('[data-variant-select-value]');
  if (valueEl) {
    valueEl.textContent = PLACEHOLDER;
    valueEl.classList.add('variant-select__value--placeholder');
  }

  document.querySelectorAll('product-form-component').forEach(guardSubmit);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', clearDefaultSelection, { once: true });
} else {
  clearDefaultSelection();
}
