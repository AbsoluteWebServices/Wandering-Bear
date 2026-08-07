import { morphSection } from '@theme/section-renderer';
import { CartAddEvent } from '@theme/events';
import { fetchConfig } from '@theme/utilities';

/**
 * Inveterate hosts `addTierToCart` outside the theme. After it hits Shopify's cart,
 * Horizon does not refresh the drawer / badge. This module wraps that helper and
 * mirrors elite-atc: cart/update + morph sections + CartAddEvent + open drawer.
 *
 * Do not touch inveterateLPSettings / updateLPSettings here — that breaks
 * Inveterate multi-tiers (ReferenceError: settings is not defined).
 */

const SOURCE = 'inveterate-cart-bridge';

const INVETERATE_READY = { intervalMs: 200, maxAttempts: 150 };
const CART_SYNC = { intervalMs: 150, maxAttempts: 40 };

/** @param {number} ms */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @template T
 * @param {() => Promise<T | null | undefined> | T | null | undefined} probe
 * @param {{ intervalMs: number, maxAttempts: number }} options
 * @returns {Promise<T | null>}
 */
async function waitUntil(probe, { intervalMs, maxAttempts }) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const value = await probe();
    if (value) return value;
    await sleep(intervalMs);
  }
  return null;
}

/** @returns {string[]} */
function getCartSectionIds() {
  return [...document.querySelectorAll('cart-items-component')]
    .map((el) => (el instanceof HTMLElement ? el.dataset.sectionId : null))
    .filter(Boolean);
}

/** @returns {Promise<{ item_count?: number, [key: string]: unknown }>} */
function fetchCart() {
  return fetch('/cart.js', { headers: { Accept: 'application/json' } }).then((r) => r.json());
}

function cartUpdateUrl() {
  return globalThis.Theme?.routes?.cart_update_url || '/cart/update.js';
}

function openCartDrawer() {
  document.querySelector('cart-drawer-component')?.open?.();
}

/**
 * @param {number} baselineCount
 * @returns {Promise<{ item_count?: number, [key: string]: unknown }>}
 */
async function waitForCartChange(baselineCount) {
  const updated = await waitUntil(async () => {
    const cart = await fetchCart();
    return typeof cart.item_count === 'number' && cart.item_count > baselineCount ? cart : null;
  }, CART_SYNC);

  return updated || fetchCart();
}

/**
 * @returns {Promise<{ cart: Record<string, unknown>, sections?: Record<string, string> }>}
 */
async function refreshCartSections() {
  const sectionIds = getCartSectionIds();
  if (sectionIds.length === 0) {
    return { cart: await fetchCart() };
  }

  const response = await fetch(
    cartUpdateUrl(),
    fetchConfig('json', {
      body: JSON.stringify({
        attributes: { _inveterate_cart_refresh: String(Date.now()) },
        sections: sectionIds.join(','),
        sections_url: `${location.pathname}${location.search}`,
      }),
    })
  );
  const data = await response.json();

  for (const id of sectionIds) {
    if (data.sections?.[id]) morphSection(id, data.sections[id]);
  }

  return { cart: data, sections: data.sections };
}

/** @param {string} [tierId] */
async function refreshCartUi(tierId) {
  try {
    const { cart, sections } = await refreshCartSections();

    document.dispatchEvent(
      new CartAddEvent(cart, SOURCE, {
        source: SOURCE,
        itemCount: cart.item_count,
        ...(tierId ? { variantId: tierId } : {}),
        sections,
      })
    );

    openCartDrawer();
  } catch (error) {
    console.warn(`[${SOURCE}] cart refresh failed`, error);
  }
}

/** @returns {((...args: unknown[]) => unknown) | null} */
function getAddTierToCart() {
  const fn = window.inveterate?.member?.tierSelection?.addTierToCart;
  return typeof fn === 'function' ? fn : null;
}

/** @returns {boolean} */
function patchAddTierToCart() {
  const selection = window.inveterate?.member?.tierSelection;
  const original = getAddTierToCart();
  if (!selection || !original) return false;
  if (original.__wbPatched) return true;

  async function wrapped(...args) {
    const tierId = typeof args[0] === 'string' ? args[0] : undefined;
    const baselineCount = (await fetchCart().catch(() => ({}))).item_count || 0;
    const result = await original.apply(this, args);

    await waitForCartChange(baselineCount);
    await refreshCartUi(tierId);

    return result;
  }

  wrapped.__wbPatched = true;
  selection.addTierToCart = wrapped;
  return true;
}

function start() {
  if (patchAddTierToCart()) return;

  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    if (patchAddTierToCart() || attempts >= INVETERATE_READY.maxAttempts) {
      clearInterval(timer);
    }
  }, INVETERATE_READY.intervalMs);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}
