import { morphSection } from '@theme/section-renderer';
import { DiscountUpdateEvent } from '@theme/events';
import { fetchConfig } from '@theme/utilities';

/**
 * Apply the member order discount on login.
 *

/** @returns {string[]} */
function getCartSectionIds() {
  const ids = new Set();
  for (const el of document.querySelectorAll('cart-items-component')) {
    if (el instanceof HTMLElement && el.dataset.sectionId) ids.add(el.dataset.sectionId);
  }
  return Array.from(ids);
}

async function applyMemberDiscount() {
  const sectionIds = getCartSectionIds();
  if (sectionIds.length === 0) return;

  try {
    const config = fetchConfig('json', {
      body: JSON.stringify({
        attributes: { _member_recalc: Date.now().toString() },
        sections: sectionIds.join(','),
        sections_url: window.location.pathname,
      }),
    });

    const response = await fetch(Theme.routes.cart_update_url, config);
    const data = await response.json();

    for (const id of sectionIds) {
      const html = data.sections?.[id];
      if (html) morphSection(id, html);
    }

    document.dispatchEvent(new DiscountUpdateEvent(data, 'member-cart-refresh'));
  } catch (error) {
  }
}

if (document.readyState === 'complete') {
  applyMemberDiscount();
} else {
  window.addEventListener('load', applyMemberDiscount, { once: true });
}
