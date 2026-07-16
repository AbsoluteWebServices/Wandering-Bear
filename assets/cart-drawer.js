import {
  DialogComponent,
  DialogOpenEvent,
  DialogCloseEvent,
} from '@theme/dialog';

import { CartAddEvent, CartUpdateEvent } from '@theme/events';
import { isMobileBreakpoint } from '@theme/utilities';

const CART_BUNDLE_EDIT_EVENT = 'cart-bundle:edit';
const CART_BUNDLE_CLOSE_EVENT = 'cart-bundle:close';


/**
 * A custom element that manages a cart drawer.
 *
 * @typedef {object} Refs
 * @property {HTMLDialogElement} dialog
 * @property {HTMLElement} [liveRegion]
 *
 * @extends {DialogComponent}
 */
class CartDrawerComponent extends DialogComponent {
  /** @type {number} */
  #summaryThreshold = 0.5;

  /** @type {AbortController | null} */
  #historyAbortController = null;

  connectedCallback() {
    super.connectedCallback();

    document.addEventListener(
      CartAddEvent.eventName,
      this.#handleCartAdd
    );

    document.addEventListener(
      CART_BUNDLE_EDIT_EVENT,
      this.#handleBundleEdit
    );

    document.addEventListener(
      CART_BUNDLE_CLOSE_EVENT,
      this.#handleBundleClose
    );

    this.addEventListener(
      DialogOpenEvent.eventName,
      this.#updateStickyState
    );

    this.addEventListener(
      DialogOpenEvent.eventName,
      this.#handleHistoryOpen
    );

    this.addEventListener(
      DialogCloseEvent.eventName,
      this.#handleHistoryClose
    );

    if (history.state?.cartDrawerOpen) {
      history.replaceState(null, '');
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();

    document.removeEventListener(
      CartAddEvent.eventName,
      this.#handleCartAdd
    );

    document.removeEventListener(
      CART_BUNDLE_EDIT_EVENT,
      this.#handleBundleEdit
    );

    document.removeEventListener(
      CART_BUNDLE_CLOSE_EVENT,
      this.#handleBundleClose
    );

    this.removeEventListener(
      DialogOpenEvent.eventName,
      this.#updateStickyState
    );

    this.removeEventListener(
      DialogOpenEvent.eventName,
      this.#handleHistoryOpen
    );

    this.removeEventListener(
      DialogCloseEvent.eventName,
      this.#handleHistoryClose
    );

    this.#historyAbortController?.abort();
  }

  #handleBundleEdit = (event) => {
    const { dialog } = /** @type {Refs} */ (this.refs);

    if (!dialog) return;

    const cartView = dialog.querySelector(
      '[data-cart-view]'
    );

    const bundleEditor = dialog.querySelector(
      'cart-bundle-editor'
    );

    if (!(bundleEditor instanceof HTMLElement)) {
      return;
    }

    cartView?.setAttribute('hidden', '');
    bundleEditor.removeAttribute('hidden');

    bundleEditor.dispatchEvent(
      new CustomEvent('bundle-editor:open', {
        detail: event.detail,
      })
    );
  };

  #handleBundleClose = () => {
    const { dialog } = /** @type {Refs} */ (this.refs);

    if (!dialog) return;

    const cartView = dialog.querySelector(
      '[data-cart-view]'
    );

    const bundleEditor = dialog.querySelector(
      'cart-bundle-editor'
    );

    bundleEditor?.setAttribute('hidden', '');
    cartView?.removeAttribute('hidden');

    this.#updateStickyState();
  };

  #handleHistoryOpen = () => {
    if (!isMobileBreakpoint()) return;

    if (!history.state?.cartDrawerOpen) {
      history.pushState(
        { cartDrawerOpen: true },
        ''
      );
    }

    this.#historyAbortController =
      new AbortController();

    window.addEventListener(
      'popstate',
      this.#handlePopState,
      {
        signal:
          this.#historyAbortController.signal,
      }
    );
  };

  #handleHistoryClose = () => {
    this.#historyAbortController?.abort();

    if (history.state?.cartDrawerOpen) {
      history.back();
    }
  };

  #handlePopState = async () => {
    if (!this.refs.dialog?.open) return;

    this.refs.dialog.style.setProperty(
      '--dialog-drawer-closing-animation',
      'none'
    );

    await this.closeDialog();

    this.refs.dialog.style.removeProperty(
      '--dialog-drawer-closing-animation'
    );
  };

  /**
   * @param {CustomEvent<{
   *   resource?: {
   *     item_count?: number
   *   }
   * }>} event
   */
  #handleCartAdd = (event) => {
    if (this.hasAttribute('auto-open')) {
      this.showDialog();
    }

    this.#announceCartCount(
      event.detail.resource?.item_count
    );
  };

  /**
   * @param {number | undefined} cartCount
   */
  #announceCartCount(cartCount) {
    const liveRegion =
      /** @type {HTMLElement | undefined} */ (
        this.refs.liveRegion
      );

    if (
      !this.refs.dialog?.open ||
      !liveRegion ||
      cartCount === undefined
    ) {
      return;
    }

    liveRegion.textContent =
      `${Theme.translations.cart_count}: ${cartCount}`;
  }

  open() {
    this.showDialog();

    customElements
      .whenDefined('shopify-payment-terms')
      .then(() => {
        const installmentsContent =
          document
            .querySelector(
              'shopify-payment-terms'
            )
            ?.shadowRoot;

        const cta =
          installmentsContent?.querySelector(
            '#shopify-installments-cta'
          );

        cta?.addEventListener(
          'click',
          this.closeDialog,
          { once: true }
        );
      });
  }

  close() {
    this.closeDialog();
  }

  #updateStickyState = () => {
    const { dialog } =
      /** @type {Refs} */ (this.refs);

    if (!dialog) return;

    const content = dialog.querySelector(
      '.cart-drawer__content'
    );

    const summary = dialog.querySelector(
      '.cart-drawer__summary'
    );

    if (!content || !summary) {
      dialog.setAttribute(
        'cart-summary-sticky',
        'false'
      );

      return;
    }

    const drawerHeight =
      dialog.getBoundingClientRect().height;

    const summaryHeight =
      summary.getBoundingClientRect().height;

    const ratio =
      summaryHeight / drawerHeight;

    dialog.setAttribute(
      'cart-summary-sticky',
      ratio > this.#summaryThreshold
        ? 'false'
        : 'true'
    );
  };
}

class CartBundleEditorComponent extends HTMLElement {
  #abortController = null;

  #bundleId = null;
  #bundleName = null;
  #collectionHandle = null;

  #cart = null;
  #bundleItems = [];
  #tempBundle = [];
  #bundleDetails = {};
  #activeBundleDetails = {};

  #bundleChanged = false;

  connectedCallback() {
    this.#abortController?.abort();
    this.#abortController = new AbortController();

    this.#bundleDetails = JSON.parse(
      document.getElementById('bundleDetails')?.textContent || '{}'
    );

    this.addEventListener(
      'bundle-editor:open',
      this.#handleOpen,
      { signal: this.#abortController.signal }
    );

    this.addEventListener(
      'click',
      this.#handleClick,
      { signal: this.#abortController.signal }
    );

    this.addEventListener(
      'submit',
      this.#handleSubmit,
      { signal: this.#abortController.signal }
    );
  }

  disconnectedCallback() {
    this.#abortController?.abort();
    this.#abortController = null;
  }

  #handleOpen = async (event) => {
    const {
      bundleId,
      bundleName,
      collectionHandle,
    } = event.detail ?? {};

    if (
      !bundleId ||
      !bundleName ||
      !collectionHandle
    ) {
      this.#showError(
        'Bundle configuration is incomplete.'
      );

      return;
    }

    this.#bundleId = String(bundleId);
    this.#bundleName = bundleName;
    this.#collectionHandle = collectionHandle;

    await this.#hydrate();
    this.#render();
  };

  #handleClick = (event) => {

    const target = event.target;

    if (!(target instanceof Element)) return;

    const button = target.closest(
      'button[data-action]'
    );

    if (!(button instanceof HTMLButtonElement)) {
      return;
    }

    if (!this.contains(button)) return;

    const action = button.dataset.action;

    if (action === 'close') {
      document.dispatchEvent(
        new CustomEvent(
          CART_BUNDLE_CLOSE_EVENT,
          { bubbles: true }
        )
      );

      return;
    }

    const productId = Number(
      button.dataset.productId
    );

    if (!Number.isFinite(productId)) return;

    if (action === 'increment') {
      event.preventDefault();
      event.stopPropagation();
      this.#changeQuantity(productId, 1);
    }

    if (action === 'decrement') {
      event.preventDefault();
      event.stopPropagation();
      this.#changeQuantity(productId, -1);
    }
  };

  #handleSubmit = async (event) => {
    if (!event.target.matches('[data-bundle-form]')) {
      return;
    }

    event.preventDefault();

    if (!this.#bundleChanged) return;

    await this.#updateBundle();
  };

  async #hydrate() {
    this.#clearError();

    const [
      flavorCollection,
      cart,
    ] = await Promise.all([
      this.#getFlavorCollection(
        this.#collectionHandle
      ),
      this.#getCart(),
    ]);

    this.#cart = cart;

    this.#bundleItems = (cart?.items ?? [])
      .filter(
        (item) =>
          String(item.properties?._bundle_id) ===
          this.#bundleId
      )
      .filter(
        (item) =>
          String(item.properties?._bundle_parent) !==
          'true'
      )
      .map((item) => ({ ...item }));

    const variantIndex = this.#getIndexFromCount(
      this.#bundleItems.reduce(
        (total, item) =>
          total + Number(item.quantity || 0),
        0
      )
    );

    this.#tempBundle = flavorCollection.map(
      (product) => {
        const cartItem = this.#bundleItems.find(
          (item) =>
            Number(item.product_id) ===
            Number(product.id)
        );

        const variant =
          product.variants?.[variantIndex] ??
          product.variants?.[0];

        return {
          id: Number(product.id),
          variantId:
            product.variants?.[0]?.id ?? null,
          key: cartItem?.key ?? null,
          title: product.title,
          price:
            variant?.selling_plan_price ??
            variant?.price ??
            0,
          image:
            product.images?.[0]?.src ?? '',
          quantity:
            Number(cartItem?.quantity || 0),
          bundleId: this.#bundleId,
          collectionHandle:
            this.#collectionHandle,
          flavorName:
            cartItem?.properties?._flavor ??
            product.title.split(' - ')[1] ??
            product.title,
          variants:
            product.variants ?? [],
          cartVariantId:
            cartItem?.variant_id ?? null,
        };
      }
    );

    this.#activeBundleDetails =
      this.#bundleDetails[
        this.#bundleName
      ] ?? {};

    this.#bundleChanged = false;

    this.#recalculateItemPrices();
  }

  async #getFlavorCollection(handle) {
    const response = await fetch(
      `/collections/${handle}/products.json?limit=250`
    );

    if (!response.ok) {
      throw new Error(
        'Unable to load bundle flavors.'
      );
    }

    const data = await response.json();

    return data.products ?? [];
  }

  async #getCart() {
    const response = await fetch('/cart.js', {
      headers: {
        Accept: 'application/json',
      },
    });

    const cart = await response.json();

    if (!response.ok) {
      throw new Error(
        cart.description ||
        cart.message ||
        'Unable to load cart.'
      );
    }

    return cart;
  }

  get #tempBundleCount() {
    return this.#tempBundle.reduce(
      (total, item) =>
        total + Number(item.quantity || 0),
      0
    );
  }

  #getIndexFromCount(count) {
    if (count <= 0) return 0;

    return count < 3
      ? count - 1
      : 2;
  }

  #changeQuantity(productId, difference) {
    const item = this.#tempBundle.find(
      (entry) =>
        Number(entry.id) ===
        Number(productId)
    );

    if (!item) return;

    item.quantity = Math.max(
      0,
      item.quantity + difference
    );

    this.#bundleChanged =
      this.#detectChanges();

    this.#recalculateItemPrices();
    this.#render();
  }

  #detectChanges() {
    return this.#tempBundle.some(
      (tempItem) => {
        const originalItem =
          this.#bundleItems.find(
            (item) =>
              Number(item.product_id) ===
              Number(tempItem.id)
          );

        return (
          Number(originalItem?.quantity || 0) !==
          Number(tempItem.quantity || 0)
        );
      }
    );
  }

  #recalculateItemPrices() {
    const variantIndex =
      this.#getIndexFromCount(
        this.#tempBundleCount
      );

    this.#tempBundle.forEach((item) => {
      const variant =
        item.variants?.[variantIndex] ??
        item.variants?.[0];

      item.price =
        variant?.selling_plan_price ??
        variant?.price ??
        0;
    });
  }

  #render() {
    this.#renderHeader();
    this.#renderTiers();
    this.#renderProducts();
    this.#renderSubmit();
  }

  #renderHeader() {
    const headline = this.querySelector(
      '[data-bundle-headline]'
    );

    if (headline) {
      headline.textContent =
        this.#activeBundleDetails.headline ??
        '';
    }

    this.querySelectorAll(
      '[data-bundle-singular-label]'
    ).forEach((element) => {
      element.textContent =
        this.#activeBundleDetails
          .singular_label ??
        'Box';
    });
  }

  #renderTiers() {
    const count = this.#tempBundleCount;

    this.querySelectorAll(
      '[data-tier]'
    ).forEach((element) => {
      const tier = Number(
        element.dataset.tier
      );

      element.toggleAttribute(
        'data-active',
        count >= tier
      );
    });

    const tierCount = Object.keys(
      this.#activeBundleDetails
        .bundle_products ?? {}
    ).length;

    const progress = this.querySelector(
      '[data-bundle-progress]'
    );

    if (progress instanceof HTMLElement) {
      const percentage =
        tierCount > 0
          ? Math.min(
              100,
              (count / tierCount) * 100
            )
          : 0;

      progress.style.width =
        `${percentage}%`;
    }

    this.querySelectorAll(
      '[data-tier-price]'
    ).forEach((element) => {
      const tier =
        Number(element.dataset.tierPrice) - 1;

      const variant =
        this.#tempBundle[0]
          ?.variants?.[tier];

      element.textContent =
        variant?.price
          ? `${this.#formatMoney(
              variant.price
            )}/ea`
          : '';
    });
  }

  #renderProducts() {
    const container = this.querySelector(
      '[data-bundle-products]'
    );

    const template = this.querySelector(
      'template[data-bundle-product-template]'
    );

    if (
      !(container instanceof HTMLElement) ||
      !(template instanceof HTMLTemplateElement)
    ) {
      return;
    }

    container.replaceChildren();

    for (const item of this.#tempBundle) {
      const fragment =
        template.content.cloneNode(true);

      const row = fragment.querySelector(
        '[data-bundle-product]'
      );

      if (!(row instanceof HTMLElement)) {
        continue;
      }

      row.dataset.productId =
        String(item.id);

      row
        .querySelectorAll('[data-product-id]')
        .forEach((element) => {
          element.dataset.productId =
            String(item.id);
        });

      const image = row.querySelector(
        '[data-product-image]'
      );

      if (image instanceof HTMLImageElement) {
        image.src = item.image;
        image.alt =
          item.flavorName ||
          item.title;
      }

      const title = row.querySelector(
        '[data-product-title]'
      );

      if (title) {
        title.textContent =
          item.flavorName ||
          item.title;
      }

      const price = row.querySelector(
        '[data-product-price]'
      );

      if (price) {
        price.textContent =
          `${this.#formatMoney(
            item.price
          )} per ${
            this.#activeBundleDetails
              .singular_label ?? 'item'
          }`;
      }

      const quantity = row.querySelector(
        '[data-product-quantity]'
      );

      if (quantity) {
        quantity.textContent =
          String(item.quantity);
      }

      const addControl = row.querySelector(
        '[data-add-control]'
      );

      const quantityControl =
        row.querySelector(
          '[data-quantity-control]'
        );

      if (addControl instanceof HTMLElement) {
        addControl.hidden =
          item.quantity > 0;
      }

      if (
        quantityControl instanceof HTMLElement
      ) {
        quantityControl.hidden =
          item.quantity === 0;
      }

      container.append(fragment);
    }
  }

  #renderSubmit() {
    const submit = this.querySelector(
      '[data-bundle-submit]'
    );

    if (!(submit instanceof HTMLButtonElement)) {
      return;
    }

    submit.disabled =
      !this.#bundleChanged;

    submit.classList.toggle(
      'opacity-50',
      submit.disabled
    );

    submit.classList.toggle(
      'pointer-events-none',
      submit.disabled
    );
  }

  async #updateBundle() {
    const updates = {};
    const additions = [];

    const bundleCount =
      this.#tempBundleCount;

    if (bundleCount <= 0) return;

    const bundleVariantIndex =
      this.#getIndexFromCount(
        bundleCount
      );

    const parentProduct =
      this.#activeBundleDetails
        .bundle_products?.[
          bundleVariantIndex
        ];

    if (!parentProduct) {
      this.#showError(
        'No bundle tier configuration was found.'
      );

      return;
    }

    const oldParentProduct =
      this.#cart.items.find(
        (item) =>
          String(
            item.properties?._bundle_id
          ) === this.#bundleId &&
          String(
            item.properties?._bundle_parent
          ) === 'true'
      );

    const newParentVariantId =
      Number(parentProduct.variant_id);

    const oldParentVariantId =
      oldParentProduct
        ? Number(
            oldParentProduct.variant_id ||
            oldParentProduct.id
          )
        : null;

    const parentChanged =
      oldParentVariantId !==
      newParentVariantId;

    const sellingPlanId =
      parentProduct.selling_plan_id ||
      null;

    const addChild = (
      item,
      variantId
    ) => {
      if (
        !item.quantity ||
        !variantId
      ) {
        return;
      }

      additions.push({
        id: Number(variantId),
        quantity:
          Number(item.quantity),
        selling_plan:
          sellingPlanId,
        properties: {
          _bundle_id:
            this.#bundleId,
          _bundle_name:
            this.#bundleName,
          _collection_handle:
            this.#collectionHandle,
          _flavor:
            item.flavorName,
        },
      });
    };

    for (const item of this.#tempBundle) {
      const newChildVariantId =
        item.variants?.[
          bundleVariantIndex
        ]?.id ??
        item.variantId;

      if (item.key) {
        if (parentChanged) {
          updates[item.key] = 0;

          addChild(
            item,
            newChildVariantId
          );
        } else {
          updates[item.key] =
            Number(item.quantity);
        }

        continue;
      }

      addChild(
        item,
        newChildVariantId
      );
    }

    if (
      oldParentProduct &&
      parentChanged
    ) {
      updates[oldParentProduct.key] = 0;
    }

    if (
      !oldParentProduct ||
      parentChanged
    ) {
      additions.push({
        id: newParentVariantId,
        quantity: 1,
        selling_plan:
          sellingPlanId,
        properties: {
          _bundle_id:
            this.#bundleId,
          _bundle_parent: 'true',
          _bundle_name:
            this.#bundleName,
          _collection_handle:
            this.#collectionHandle,
        },
      });
    }

    if (Object.keys(updates).length) {
      const updateResponse = await fetch(
        '/cart/update.js',
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            updates,
          }),
        }
      );

      if (!updateResponse.ok) {
        this.#showError(
          'Unable to update the bundle.'
        );

        return;
      }
    }

    if (additions.length) {
      const addResponse = await fetch(
        '/cart/add.js',
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            items: additions,
          }),
        }
      );

      if (!addResponse.ok) {
        this.#showError(
          'Unable to add the updated bundle.'
        );

        return;
      }
    }

    this.#cart = await this.#getCart();

    document.dispatchEvent(
      new CartUpdateEvent(
        this.#cart,
        'cart',
        {
          itemCount:
            this.#cart.item_count,
          source: 'cart',
        }
      )
    );

    this.#bundleChanged = false;

    document.dispatchEvent(
      new CustomEvent(
        CART_BUNDLE_CLOSE_EVENT,
        { bubbles: true }
      )
    );
  }

  #formatMoney(value) {
    const number = Number(value || 0);

    /*
     * products.json variant prices are usually strings
     * like "12.00", not integer cents.
     */
    return new Intl.NumberFormat(
      document.documentElement.lang ||
        'en-US',
      {
        style: 'currency',
        currency:
          window.Shopify?.currency?.active ||
          'USD',
      }
    ).format(number);
  }

  #showError(message) {
    const error = this.querySelector(
      '[data-bundle-error]'
    );

    if (!(error instanceof HTMLElement)) {
      return;
    }

    error.textContent = message;
    error.hidden = false;
  }

  #clearError() {
    const error = this.querySelector(
      '[data-bundle-error]'
    );

    if (!(error instanceof HTMLElement)) {
      return;
    }

    error.textContent = '';
    error.hidden = true;
  }
}

if (
  !customElements.get(
    'cart-bundle-editor'
  )
) {
  customElements.define(
    'cart-bundle-editor',
    CartBundleEditorComponent
  );
}

if (
  !customElements.get(
    'cart-drawer-component'
  )
) {
  customElements.define(
    'cart-drawer-component',
    CartDrawerComponent
  );
}

