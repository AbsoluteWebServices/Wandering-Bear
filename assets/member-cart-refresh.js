import { morphSection } from '@theme/section-renderer';
import { DiscountUpdateEvent } from '@theme/events';
import { fetchConfig } from '@theme/utilities';

/**
 * Keeps the cart's member pricing + order discount in sync with what the shopper
 * should see. The "Elite member 5% OFF" order discount (and the member line-total
 * allocation in cart-products.liquid that mirrors it) only reflect once the
 * discount has actually recomputed, which Shopify does on cart mutation. So we:
 *   - poke the cart on load when the server render didn't yet have the discount, and
 *   - re-render the cart section when the drawer opens, so it's never shown stale.
 */

/** @returns {string[]} */
function getCartSectionIds() {
  const ids = new Set();
  for (const el of document.querySelectorAll('cart-items-component')) {
    if (el instanceof HTMLElement && el.dataset.sectionId) ids.add(el.dataset.sectionId);
  }
  return Array.from(ids);
}

let inFlight = false;

async function applyMemberDiscount() {
  if (inFlight) return;

  const sectionIds = getCartSectionIds();
  if (sectionIds.length === 0) return;

  inFlight = true;

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
  } finally {
    inFlight = false;
  }
}


if (!window.__memberDiscountApplied) {
  if (document.readyState === 'complete') {
    applyMemberDiscount();
  } else {
    window.addEventListener('load', applyMemberDiscount, { once: true });
  }
}

// When the cart drawer opens, re-render the cart section
let refreshedOnOpen = false;
document.addEventListener('cart-drawer:open', () => {
  if (refreshedOnOpen) return;
  refreshedOnOpen = true;
  applyMemberDiscount();
});
