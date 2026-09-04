import { Component } from '@theme/component';
import { fetchConfig } from '@theme/utilities';
import { CartUpdateEvent } from '@theme/events';

/**
 * A custom element that manages the "Add/Modify Flavors" bundle editor.
 *
 * The editable flavor list is produced server-side by `sections/bundle-editor.liquid`
 * via the Section Rendering API (rendered against the flavor collection's URL). This
 * component only handles interaction (increment/decrement), quantity hydration from the
 * live cart, and the cart mutation on "Update bundle". After a successful update it
 * dispatches a `CartUpdateEvent`, which Horizon's `cart-items-component` picks up to
 * re-render the drawer through section rendering.
 *
 * @extends {Component}
 */
class BundleEditorComponent extends Component {
  /**
   * @typedef {Object} BundleRow
   * @property {HTMLElement} el
   * @property {number} productId
   * @property {number} variantId
   * @property {Array<{ id: number, price: string, price_cents: number, selling_plan_price: string | null, selling_plan_price_cents: number | null }>} variants
   * @property {number} quantity
   * @property {number} originalQuantity
   * @property {string | null} key
   * @property {number | null} cartVariantId
   * @property {string | null} flavorName
   */

  /**
   * @typedef {Object} BundleState
   * @property {string} collectionHandle
   * @property {string} bundleName
   * @property {string} bundleId
   * @property {string} bundleType - '32oz' for multi-serve bundles, '' otherwise.
   * @property {string} bundleSize - Fixed carton count for 32oz bundles.
   * @property {string} flavorType - 'single' or 'mix' for 32oz bundles.
   * @property {Array<{ variant_id: number, selling_plan_id: number | null }>} tiers
   * @property {number} tierCount
   * @property {BundleRow[]} rows
   */

  /** @type {BundleState | null} */
  #state = null;

  /** @type {boolean} */
  #loading = false;

  /** Guards against the submit firing `update` twice (which retries a stale line). */
  #committing = false;

  /** @type {HTMLElement | null} Where focus goes when the panel closes again. */
  #returnFocusTo = null;

  #onTriggerClick = this.#handleTriggerClick.bind(this);

  /** @type {HTMLDialogElement | null} The drawer this panel lives in, if any. */
  #dialog = null;

  #onDialogClose = () => {
    if (!this.hasAttribute('data-open')) return;

    this.removeAttribute('data-open');
    this.#setFocusContainment(false, { moveFocus: false });
  };

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener('click', this.#onTriggerClick);

    // Applied here and not in the Liquid: this script is also what lifts `inert`
    // on open, so an attribute in the markup would leave the panel visible with
    // every control dead if the script ever failed to run.
    this.inert = !this.hasAttribute('data-open');

    // `close` does not bubble. Closing the drawer leaves the panel open, so
    // without this the cart stays inert the next time the drawer opens.
    this.#dialog = this.closest('dialog');
    this.#dialog?.addEventListener('close', this.#onDialogClose);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('click', this.#onTriggerClick);
    this.#dialog?.removeEventListener('close', this.#onDialogClose);
    this.#dialog = null;
  }

  /** @returns {HTMLElement | null} */
  get #panel() {
    return this.querySelector('[data-bundle-panel]');
  }

  /**
   * Confines focus to whichever view is on screen, the cart or the bundle panel.
   *
   * The panel is only moved aside with `transform: translateX(100%)`, which hides
   * it visually but leaves it in the tab order, so the off-screen side has to be
   * marked `inert` explicitly.
   *
   * @param {boolean} open - Whether the bundle panel is now the visible view.
   * @param {{ moveFocus?: boolean }} [options] - `moveFocus: false` re-syncs
   *   `inert` only, for when the drawer itself is closing and the browser is
   *   already restoring focus to whatever opened it.
   */
  #setFocusContainment(open, { moveFocus = true } = {}) {
    for (const sibling of this.parentElement?.children ?? []) {
      if (sibling === this || !(sibling instanceof HTMLElement)) continue;
      sibling.inert = open;
    }

    this.inert = !open;

    if (!moveFocus) {
      this.#returnFocusTo = null;
      return;
    }

    if (open) {
      const first = this.querySelector(
        'button, [href], input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])'
      );

      // preventScroll: the panel is still at translateX(100%) here, and a plain
      // focus() would scroll the drawer sideways to reveal it, fighting the
      // transition. `overflow: hidden` does not prevent that — clipped boxes are
      // still scrollable programmatically.
      if (first instanceof HTMLElement) first.focus({ preventScroll: true });

      return;
    }

    // Committing an edit re-renders the cart, which can replace the trigger, and
    // focusing a detached node silently drops focus to <body>.
    const target = this.#returnFocusTo?.isConnected
      ? this.#returnFocusTo
      : this.closest('dialog')?.querySelector('.cart-drawer__close-button');

    this.#returnFocusTo = null;

    if (target instanceof HTMLElement) target.focus({ preventScroll: true });
  }

  /**
   * Opens the editor when an `[data-bundle-edit-trigger]` element is clicked anywhere.
   * @param {MouseEvent} event
   */
  #handleTriggerClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    const trigger = target?.closest('[data-bundle-edit-trigger]');
    if (!(trigger instanceof HTMLElement)) return;

    event.preventDefault();

    // Captured here rather than from document.activeElement on open, because
    // Safari does not focus a button on click.
    this.#returnFocusTo = trigger;
    this.open({
      collectionHandle: trigger.dataset.collectionHandle ?? '',
      bundleName: trigger.dataset.bundleName ?? '',
      bundleId: trigger.dataset.bundleId ?? '',
      bundleType: trigger.dataset.bundleType ?? '',
      bundleSize: trigger.dataset.bundleSize ?? '',
      flavorType: trigger.dataset.flavorType ?? '',
      sellingPlan: trigger.dataset.sellingPlan ?? '',
    });
  }

  /**
   * Fetches the section-rendered editor, hydrates quantities and reveals the panel.
   * @param {{ collectionHandle: string, bundleName: string, bundleId: string }} config
   */
  async open({ collectionHandle, bundleName, bundleId, bundleType, bundleSize, flavorType, sellingPlan }) {
    const panel = this.#panel;
    if (!collectionHandle || !panel) return;

    const url = new URL(`/collections/${collectionHandle}`, window.location.origin);
    url.searchParams.set('section_id', 'bundle-editor');

    const html = await fetch(url.toString()).then((response) => response.text());
    panel.innerHTML = html;

    const root = panel.querySelector('[data-bundle-editor-root]');
    if (!(root instanceof HTMLElement)) return;

    this.#state = {
      collectionHandle,
      bundleName: bundleName || root.dataset.bundleName || '',
      bundleId,
      bundleType,
      bundleSize,
      flavorType,
      sellingPlan,
      isMember: this.querySelector('form').dataset.isMember === 'true',
      memberTier: this.querySelector('form').dataset.memberTier || '',
      tiers: this.#parseJSON(root.dataset.tiers, []),
      tierCount: Number(root.dataset.tierCount || 0),
      rows: Array.from(panel.querySelectorAll('[data-bundle-row]')).map((el) => ({
        el: /** @type {HTMLElement} */ (el),
        productId: Number(/** @type {HTMLElement} */ (el).dataset.productId),
        variantId: Number(/** @type {HTMLElement} */ (el).dataset.variantId),
        variants: this.#parseJSON(/** @type {HTMLElement} */ (el).dataset.variants, []),
        quantity: 0,
        originalQuantity: 0,
        key: null,
        cartVariantId: null,
        flavorName: /** @type {HTMLElement} */ (el).dataset.flavorName || null,
      })),
    };

    await this.#hydrateQuantities();
    this.dataset.bundleMode = this.#isSingle ? 'single' : this.#isMix ? 'mix' : 'default';
    this.#render();
    this.setAttribute('data-open', '');
    this.#setFocusContainment(true);
  }

  /** Reveals the current bundle's line quantities from the live cart. */
  async #hydrateQuantities() {
    if (!this.#state) return;

    const cart = await fetch('/cart.js', { headers: { Accept: 'application/json' } }).then((r) => r.json());

    const items = (cart.items ?? []).filter(
      (item) =>
        String(item.properties?._bundle_id) === String(this.#state?.bundleId) &&
        String(item.properties?._bundle_parent) !== 'true'
    );

    for (const row of this.#state.rows) {
      // Match on _bundle_product_id (the flavor product) first: a child line's own
      // product_id can be a bundle_unit product, so it won't equal row.productId.
      // Fall back to product_id for legacy lines written before that property existed.
      const cartItem = items.find(
        (item) => Number(item.properties?._bundle_product_id) === row.productId
      ) ?? items.find((item) => Number(item.product_id) === row.productId);
      row.quantity = cartItem?.quantity ?? 0;
      row.originalQuantity = row.quantity;
      row.key = cartItem?.key ?? null;
      row.cartVariantId = cartItem ? Number(cartItem.variant_id ?? cartItem.id) : null;
      row.flavorName = cartItem?.properties?._flavor ?? row.flavorName;
    }
  }

  /** @returns {boolean} True for any 32oz multi-serve bundle. */
  get #is32oz() {
    return this.#state?.bundleType === '32oz';
  }

  /** @returns {boolean} 32oz mix/variety bundle (multiple flavors + indicator). */
  get #isMix() {
    return this.#is32oz && this.#state?.flavorType === 'mix';
  }

  /** @returns {boolean} 32oz single-flavor bundle (single-select). */
  get #isSingle() {
    return this.#is32oz && this.#state?.flavorType === 'single';
  }

  /** @returns {number} Fixed carton count for a 32oz bundle. */
  get #bundleSizeNum() {
    return Number(this.#state?.bundleSize || 0);
  }

  /** @returns {number} */
  get #totalQuantity() {
    return this.#state?.rows.reduce((total, row) => total + Number(row.quantity || 0), 0) ?? 0;
  }

  /**
   * Maps a bundle count to the pricing/variant tier index.
   *
   * 32oz bundles have a fixed carton count and only two tiers; the tier is
   * decided by the carton count, mirroring `_mapTo32ozBundle` in
   * `product-form-bundle.ts` (≤3 cartons → tier 0, otherwise tier 1). Other
   * bundles use the generic 1/2/3 mapping.
   *
   * @param {number} count
   * @returns {number}
   */
  #tierIndex(count) {
    if (this.#is32oz) {
      return this.#bundleSizeNum <= 3 ? 0 : 1;
    }
    if (count <= 0) return 0;
    return count < 3 ? count - 1 : 2;
  }

  /**
   * Resolves the SKU a tier should price and add. For 32oz the flavor variant may
   * reference a bundle_unit variant (mix / single-3) — that per-carton SKU drives
   * both price and cart. A plain variant with no bundle_unit (e.g. the single-6
   * 6-pack) is used as-is. Mirrors the resolution in `product-form-bundle.ts`.
   *
   * @param {BundleRow} row
   * @param {number} tier
   */
  #resolveVariant(row, tier) {
    const variants = row?.variants ?? [];
    if (!this.#is32oz) return variants[tier];
    // Mix uses the per-carton bundle unit on the 3-pack variant (variants[0]): its
    // bundle_unit_6 sibling for a 6-carton bundle, else its bundle_unit — so mix prices/adds
    // bundle units, not the 6-pack SKU. Single uses the tier variant's bundle_unit when
    // present (single-3), otherwise the plain variant (single-6 = regular 6-pack).
    if (this.#isMix) {
      const base = variants[0];
      const unit = (this.#bundleSizeNum >= 6 ? base?.bundle_unit_6 : base?.bundle_unit) ?? base?.bundle_unit;
      return unit ?? base ?? variants[tier];
    }
    const source = variants[tier];
    return source?.bundle_unit ?? source ?? variants[tier];
  }

  /** Syncs the DOM (quantities, prices, progress, indicator, savings, update button) to state. */
  #render() {
    if (!this.#state) return;

    const isMember = this.#state?.isMember ?? false;
    const memberTier = this.#state?.memberTier ?? '';

    const hasSellingPlan = this.#state?.sellingPlan && this.#state?.sellingPlan !== null;
    const sellingPlanElements = this.querySelectorAll('[data-selling-plan]');
    const otpElements = this.querySelectorAll('[data-otp]');

    sellingPlanElements.forEach(element => {
      element?.classList?.toggle('hidden', !hasSellingPlan && memberTier !== 'Elite');
    });
    otpElements.forEach(element => {
      element?.classList?.toggle('hidden', hasSellingPlan || memberTier === 'Elite');
    });

    const total = this.#totalQuantity;
    const variantIndex = this.#tierIndex(total);
    const atCap = this.#is32oz && total >= this.#bundleSizeNum;

    for (const row of this.#state.rows) {
      row.el.dataset.quantity = String(row.quantity);

      const qty = row.el.querySelector('[data-bundle-qty]');
      if (qty) qty.textContent = String(row.quantity);

      // Toggle via inline style rather than the `hidden` class: the theme's
      // custom `.wb-flex` rule overrides Tailwind's `.hidden`, so a class swap
      // would leave elements visible. Inline styles beat any class.
      const add = row.el.querySelector('[data-bundle-add]');
      const selected = row.el.querySelector('[data-bundle-selected]');
      const stepper = row.el.querySelector('[data-bundle-stepper]');
      const increment = row.el.querySelector('[data-bundle-increment]');
      // Member-only flavors an ineligible customer can't freely add render an
      // Unlock button alongside a hidden Add. A selling plan (subscription)
      // unlocks them, so they behave like any other flavor. Elite/VIP rows are
      // never marked member-only (server renders them normally).
      const unlock = row.el.querySelector('[data-bundle-unlock]');
      const memberOnly = row.el.hasAttribute('data-bundle-member-only');
      const locked = memberOnly && !hasSellingPlan;
      const active = row.quantity > 0;

      if (this.#isSingle) {
        // Single-select: no stepper; the chosen flavor shows the SELECTED state.
        if (stepper instanceof HTMLElement) stepper.style.display = 'none';
        if (selected instanceof HTMLElement) selected.style.display = active ? '' : 'none';
        if (unlock instanceof HTMLElement) unlock.style.display = locked && !active ? '' : 'none';
        if (add instanceof HTMLElement) add.style.display = !locked && !active ? '' : 'none';
      } else {
        if (selected instanceof HTMLElement) selected.style.display = 'none';
        if (stepper instanceof HTMLElement) stepper.style.display = active ? '' : 'none';
        // Empty row: Unlock when locked, otherwise Add.
        if (unlock instanceof HTMLElement) unlock.style.display = locked && !active ? '' : 'none';
        if (add instanceof HTMLElement) add.style.display = !locked && !active ? '' : 'none';
      }

      // A locked flavor already in the bundle may only be removed: keep the "+"
      // visible but disabled so the only action is decrement. When qty hits 0
      // the stepper hides and Unlock returns (handled above). The mix-mode cap
      // loop below also respects `locked`.
      if (increment instanceof HTMLButtonElement) increment.disabled = locked;

      const price = row.el.querySelector('[data-bundle-price]');
      const variant = this.#resolveVariant(row, variantIndex);

      if (price && variant) price.textContent = variant.selling_plan_price && (hasSellingPlan || memberTier === 'Elite') ? variant.selling_plan_price : variant.price;
    }

    // Mix mode caps the total at the carton count; block adding beyond it.
    // Locked (member-only, no selling plan) rows stay disabled regardless.
    if (this.#isMix) {
      for (const b of this.querySelectorAll('[data-bundle-increment], [data-bundle-add]')) {
        if (!(b instanceof HTMLButtonElement)) continue;
        const bRow = b.closest('[data-bundle-row]');
        const bLocked = !!bRow?.hasAttribute('data-bundle-member-only') && !hasSellingPlan;
        b.disabled = atCap || bLocked;
      }
    }

    const tierCount = this.#state.tierCount || this.#state.tiers.length;
    let progress = 0;

    if (tierCount === 3) {
      switch (total) {
        case 0:
          progress = 0;
          break;
        case 1:
          progress = 0;
          break;
        case 2:
          progress = 50;
          break;
        case 3:
          progress = 100;
          break;
      }
    } else {
      progress = tierCount ? Math.min(100, (total / tierCount) * 100) : 0;
    }

    const bar = this.querySelector('[data-bundle-progress]');
    if (bar instanceof HTMLElement) bar.style.width = `${progress}%`;

    for (const dot of this.querySelectorAll('[data-tier-dot]')) {
      const tier = Number(/** @type {HTMLElement} */ (dot).dataset.tierDot);
      const inner = dot.querySelector('[data-tier-dot-inner]');
      const outer = dot.querySelector('[data-dot-outer]');
      const active = total >= tier;

      dot.classList.toggle('!outline-gold', active);
      dot.classList.toggle('!bg-white', active);
      dot.classList.toggle('outline-[#CFBDB1]', !active);
      dot.classList.toggle('bg-[#F2E6DC]', !active);
      inner?.classList.toggle('!bg-gold', active);
    }

    this.#renderIndicator();
    this.#renderSavings();

    const canUpdate = this.#canUpdate;
    const button = this.querySelector('[data-bundle-update]');
    if (button instanceof HTMLButtonElement) {
      button.disabled = !canUpdate;
      button.classList.toggle('opacity-50', !canUpdate);
      button.classList.toggle('!pointer-events-none', !canUpdate);
    }

    /** Set the content height to 100% of the viewport height minus the header and footer heights */
    const header = this.querySelector('[data-bundle-editor-header]');
    const footer = this.querySelector('[data-bundle-editor-footer]');
    if (header && footer) {
      const headerHeight = header.offsetHeight;
      const footerHeight = footer.offsetHeight;
      const content = this.querySelector('[data-bundle-editor-content]');
      content.style.height = `calc(100dvh - ${headerHeight + footerHeight}px)`;
    }


  }

  /** @returns {boolean} True when any flavor quantity differs from the cart. */
  get #bundleChanged() {
    return this.#state?.rows.some((row) => row.quantity !== row.originalQuantity) ?? false;
  }

  /**
   * Whether the current selection can be committed. 32oz bundles must be filled
   * to the exact carton count; other bundles just need at least one item.
   * @returns {boolean}
   */
  get #canUpdate() {
    if (!this.#bundleChanged) return false;
    const total = this.#totalQuantity;
    if (this.#is32oz) return total === this.#bundleSizeNum;
    return total > 0;
  }

  /** Renders the 32oz variety flavor indicator (one carton card per serving). */
  #renderIndicator() {
    const container = this.querySelector('[data-32oz-multi-serve-container]');
    if (!(container instanceof HTMLElement)) return;

    if (!this.#isMix) {
      container.style.display = 'none';
      container.innerHTML = '';
      return;
    }

    /** @type {Array<{ src: string, name: string }>} */
    const cartons = [];
    for (const row of this.#state?.rows ?? []) {
      const bundleImage = row.el.dataset.bundleImage ?? '';
      const img = row.el.querySelector('img');
      const src = bundleImage ? bundleImage : img?.getAttribute('src') ?? '';
      const name = row.el.dataset.flavorName ?? '';
      for (let i = 0; i < Number(row.quantity || 0); i += 1) cartons.push({ src, name });
    }

    const slots = this.#bundleSizeNum || this.#totalQuantity;
    let html = '';
    for (let i = 0; i < slots; i += 1) {
      const carton = cartons[i];
      const rotate = i % 2 === 0 ? 'rotate-[9.03deg]' : '-rotate-[9.03deg]';
      if (carton) {
        html +=
          `<div class="wb-flex flex-col justify-center items-center gap-1 p-2 rounded-[5px] bg-[#F9F3ED] w-[51px] min-w-[51px] max-w-[51px]">` +
          `<img src="${this.#escape(carton.src)}" alt="${this.#escape(carton.name)}" class="!max-w-5 !h-10 object-contain ${rotate}" width="24" height="48">` +
          `<span class="font-kurdis-semi-condensed text-[10px] text-bear-black font-bold text-center leading-tight">${this.#escape(carton.name)}</span>` +
          `</div>`;
      } else {
        html +=
          `<div class="wb-flex flex-col justify-center items-center p-2 rounded-[5px] h-auto min-h-[71px] border border-dashed border-[#CFBDB1] w-[51px] min-w-[51px] max-w-[51px]"><div class="!h-10"></div></div>`;
      }
    }

    container.innerHTML = html;
    container.style.display = 'flex';
  }

  /** Renders the "Autoship & Bundling Savings" */
  #renderSavings() {

    const sellingPlan = this.#state?.sellingPlan;
    const isMember = this.#state?.isMember ?? false;
    const memberTier = this.#state?.memberTier ?? '';
    const hasSellingPlan = this.#state?.sellingPlan && this.#state?.sellingPlan !== null;

    const savingsTextSellingPlan = this.querySelector('[data-savings-selling-plan]');
    const savingsTextOTP = this.querySelector('[data-savings-otp]');

    if (savingsTextSellingPlan && savingsTextOTP) {
      sellingPlan && sellingPlan !== null ? savingsTextSellingPlan.classList.remove('hidden') : savingsTextOTP.classList.remove('hidden');
    }
    
    const row = this.querySelector('[data-bundle-savings-row]');
    const amountEl = this.querySelector('[data-bundle-savings]');
    if (!(row instanceof HTMLElement) || !(amountEl instanceof HTMLElement)) return;

    const tier = this.#tierIndex(this.#totalQuantity);
    const useSellingPlan = Boolean(this.#state?.tiers?.[tier]?.selling_plan_id && hasSellingPlan);

    let savings = 0;
    for (const r of this.#state?.rows ?? []) {
      const qty = Number(r.quantity || 0);
      if (!qty) continue;
      const variant = this.#resolveVariant(r, tier);
      if (!variant) continue;
      const original = Number(variant.compare_at_price_cents ?? r.variants[0]?.price_cents ?? variant.price_cents ?? 0);
      const effective =
        (useSellingPlan || memberTier === 'Elite')
          ? Number(variant.selling_plan_price_cents)
          : Number(variant.price_cents ?? 0);
      savings += Math.max(0, original - effective) * qty;
    }



    amountEl.textContent = `-${this.#formatMoney(savings)}`;
    row.style.display = savings > 0 ? 'flex' : 'none';
  }

  /**
   * @param {number} cents
   * @returns {string}
   */
  #formatMoney(cents) {
    return (Number(cents || 0) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  }

  /**
   * @param {string} value
   * @returns {string}
   */
  #escape(value) {
    return String(value).replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c)
    );
  }

  /**
   * @param {Event} event
   * @returns {BundleRow | undefined}
   */
  #rowFromEvent(event) {
    const target = event.target instanceof Element ? event.target : null;
    const rowEl = target?.closest('[data-bundle-row]');
    return this.#state?.rows.find((row) => row.el === rowEl);
  }

  /**
   * Increments a flavor's quantity (or selects it in single-flavor mode).
   * Bound declaratively via `on:click`.
   * @param {Event} event
   */
  increment(event) {
    const row = this.#rowFromEvent(event);
    if (!row) return;

    // Member-only flavors an ineligible customer can't add — unless a selling
    // plan (subscription) is selected, which unlocks them. Without one, adding
    // is never allowed even if the flavor is already in the bundle; only removal.
    const hasSellingPlan = this.#state?.sellingPlan && this.#state?.sellingPlan !== null;
    if (row.el.hasAttribute('data-bundle-member-only') && !hasSellingPlan) return;

    if (this.#isSingle) {
      this.#selectSingle(row);
      return;
    }

    // 32oz mix bundles are capped at the fixed carton count.
    if (this.#is32oz && this.#totalQuantity >= this.#bundleSizeNum) return;

    row.quantity += 1;
    this.#render();
  }

  /**
   * Makes a flavor the sole selection for a single-flavor 32oz bundle: it takes
   * the full carton count and every other flavor is cleared.
   * @param {BundleRow} row
   */
  #selectSingle(row) {
    for (const r of this.#state?.rows ?? []) r.quantity = 0;
    row.quantity = this.#bundleSizeNum || 1;
    this.#render();
  }

  /**
   * Decrements a flavor's quantity. Bound declaratively via `on:click`.
   * @param {Event} event
   */
  decrement(event) {
    const row = this.#rowFromEvent(event);
    if (!row) return;
    row.quantity = Math.max(0, row.quantity - 1);
    this.#render();
  }

  /** Closes the editor and returns to the cart. Bound declaratively via `on:click`. */
  backToCart() {
    this.removeAttribute('data-open');
    this.#setFocusContainment(false);
  }

  /**
   * Opens the membership modal from a member-only flavor's "Locked" button.
   * Bound declaratively via `on:click`.
   *
   * The modal (`snippets/aw-modal.liquid`) listens on the window for
   * `modal-open` and only opens when `detail.modal` matches its own metaobject
   * handle, so the event must be dispatched on window — not on the button.
   */
  openMembershipModal() {
    window.dispatchEvent(
      new CustomEvent('modal-open', {
        detail: { modal: 'membership' },
      })
    );
  }

  /**
   * Commits the edited bundle to the cart. Bound declaratively via `on:submit`.
   * Re-entrancy guarded: the submit can fire twice, and a second pass would
   * retry an already-removed line ("updates parameter is invalid").
   * @param {SubmitEvent} [event]
   */
  async update(event) {
    event?.preventDefault();
    this.#handleLoading(event,true);

    if (this.#committing) return;
    this.#committing = true;

    try {
      await this.#commit();
      
    } finally {
      this.#committing = false;
      this.#handleLoading(event,false);
    }
  }

  /**
   * @param {boolean} loading
   */
  #handleLoading(event,loading) {
    if (event.target instanceof HTMLElement) {
      event.target.querySelector('[data-no-load]').classList.toggle('hidden', loading);
      event.target.querySelector('[data-loading]').classList.toggle('hidden', !loading);
    }
  }

  /** Performs the actual cart mutation for {@link update}. */
  async #commit() {
    const state = this.#state;
    if (!state || !this.#bundleChanged) return;

    /** @type {Record<string, number>} */
    const updates = {};
    /** @type {Array<Record<string, unknown>>} */
    const additions = [];

    const { bundleId, collectionHandle, bundleName, bundleType, flavorType } = state;

    const bundleCount = state.rows.reduce((total, row) => total + Number(row.quantity || 0), 0);
    if (bundleCount <= 0) return;

    // Preserve the 32oz identity so the edited bundle keeps rendering (and
    // re-editing) as a 32oz bundle in the cart.
    const bundleProps =
      bundleType === '32oz'
        ? { _bundle_type: bundleType, _flavor_type: flavorType, _bundle_size: bundleCount }
        : {};

    const bundleVariantIndex = this.#tierIndex(bundleCount);
    const parentTier = state.tiers[bundleVariantIndex];
    if (!parentTier) return;

    const cart = await fetch('/cart.js', { headers: { Accept: 'application/json' } }).then((r) => r.json());

    const oldParentProduct = (cart.items ?? []).find(
      (item) =>
        String(item.properties?._bundle_id) === String(bundleId) &&
        String(item.properties?._bundle_parent) === 'true'
    );

    const newParentVariantId = Number(parentTier.variant_id);
    const oldParentVariantId = oldParentProduct ? Number(oldParentProduct.variant_id || oldParentProduct.id) : null;
    const parentChanged = oldParentVariantId !== newParentVariantId;

    // Only carry a selling plan when the bundle in the cart is actually a
    // subscription. Forcing `parentTier.selling_plan_id` onto a one-time bundle
    // (or onto a child variant that doesn't offer that exact plan) makes the
    // cart reject the add with a selling-plan error. Parent keeps the tier's
    // plan; each child uses its own plan id.
    const isSubscription = Boolean(oldParentProduct?.selling_plan_allocation?.selling_plan?.id);
    const parentSellingPlan = isSubscription ? parentTier.selling_plan_id || null : null;

    /**
     * @param {BundleRow} row
     * @param {number} variantId
     * @param {number | null} sellingPlan
     */
    const addChild = (row, variantId, sellingPlan) => {
      if (!row.quantity || !variantId) return;
      additions.push({
        id: Number(variantId),
        quantity: Number(row.quantity),
        selling_plan: sellingPlan,
        properties: {
          _bundle_id: bundleId,
          _bundle_name: bundleName,
          _collection_handle: collectionHandle,
          // `_flavor` is what the PDP writes and what `cart-products.liquid`
          // reads for the child line title; keep `_flavor_name` for parity.
          _flavor: row.flavorName,
          _flavor_name: row.flavorName,
          _bundle_product_id: row.productId,
          ...bundleProps,
        },
      });
    };

    const addParent = () => {
      additions.push({
        id: newParentVariantId,
        quantity: 1,
        selling_plan: parentSellingPlan,
        properties: {
          _bundle_id: bundleId,
          _bundle_parent: 'true',
          _bundle_name: bundleName,
          _collection_handle: collectionHandle,
          ...bundleProps,
        },
      });
    };

    for (const row of state.rows) {
      const childVariant = this.#resolveVariant(row, bundleVariantIndex);
      const newChildVariantId = childVariant?.id || row.variantId;
      const childSellingPlan = isSubscription ? childVariant?.selling_plan_id || null : null;

      if (row.key) {
        const variantChanged = Number(row.cartVariantId) !== Number(newChildVariantId);
        if (variantChanged) {
          updates[row.key] = 0;
          addChild(row, newChildVariantId, childSellingPlan);
        } else {
          updates[row.key] = Number(row.quantity);
        }
        continue;
      }

      addChild(row, newChildVariantId, childSellingPlan);
    }

    if (oldParentProduct && parentChanged) updates[oldParentProduct.key] = 0;
    if (!oldParentProduct || parentChanged) addParent();

 
    if (additions.length) {
      const response = await fetch('/cart/add.js', fetchConfig('json', { body: JSON.stringify({ items: additions }) }));
      if (!response.ok) {
        console.error(await response.text());
        return;
      }
    }


    let updatedCart = null;
    if (Object.keys(updates).length) {
      const response = await fetch('/cart/update.js', fetchConfig('json', { body: JSON.stringify({ updates }) }));
      if (!response.ok) {
        console.error(await response.text());
        return;
      }
      updatedCart = await response.json();
    }

    if (!updatedCart) {
      updatedCart = await fetch('/cart.js', { headers: { Accept: 'application/json' } }).then((r) => r.json());
    }

    document.dispatchEvent(
      new CartUpdateEvent(updatedCart, 'bundle-editor', {
        itemCount: updatedCart.item_count,
        source: 'bundle-editor',
      })
    );

    this.backToCart();
  }

  /**
   * @param {string | undefined} value
   * @param {any} fallback
   * @returns {any}
   */
  #parseJSON(value, fallback) {
    if (!value) return fallback;
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
}

if (!customElements.get('bundle-editor-component')) {
  customElements.define('bundle-editor-component', BundleEditorComponent);
}
