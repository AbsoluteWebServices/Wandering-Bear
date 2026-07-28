import { CartUpdateEvent } from '@theme/events';

class CartProductsComponent extends HTMLElement {
    /** @type {AbortController | null} */
    #abortController = null;
  
    /** @type {boolean} */
    #busy = false;
  
    connectedCallback() {
      this.#abortController?.abort();
      this.#abortController = new AbortController();
  
      this.addEventListener(
        'click',
        this.#handleClick,
        {
          signal: this.#abortController.signal,
        }
      );
  
      document.addEventListener(
        'click',
        this.#handleOutsideClick,
        {
          signal: this.#abortController.signal,
        }
      );
  
      document.addEventListener(
        'keydown',
        this.#handleKeydown,
        {
          signal: this.#abortController.signal,
        }
      );
    }
  
    disconnectedCallback() {
      this.#abortController?.abort();
      this.#abortController = null;
    }
  
    /**
     * Handles controls rendered inside cart-products-component.
     *
     * @param {MouseEvent} event
     */

    #handleClick = async (event) => {
        const target = event.target;
      
        if (!(target instanceof Element)) return;
      
        const button = target.closest(
          'button[data-action]'
        );
      
        if (!(button instanceof HTMLButtonElement)) {
          return;
        }
      
        if (!this.contains(button)) return;
      
        switch (button.dataset.action) {
          case 'remove-bundle':
            await this.#removeBundle(button);
            break;

          case 'remove-line':
            await this.#removeLine(button);
            break;

          case 'toggle-frequency':
            this.#toggleFrequency(button);
            break;
      
          case 'change-frequency':
            await this.#changeFrequency(button);
            break;
        }
    };
  
    /**
     * Closes frequency dropdowns when clicking elsewhere.
     *
     * @param {MouseEvent} event
     */
    #handleOutsideClick = (event) => {
      const target = event.target;
  
      if (
        target instanceof Element &&
        target.closest('[data-frequency-selector]')
      ) {
        return;
      }
  
      this.#closeFrequencyDropdowns();
    };
  
    /**
     * Closes the active frequency dropdown on Escape.
     *
     * @param {KeyboardEvent} event
     */
    #handleKeydown = (event) => {
      if (event.key !== 'Escape') return;
  
      const selector =
        this.#getOpenFrequencySelector();
  
      if (!selector) return;
  
      const trigger = selector.querySelector(
        '[data-action="toggle-frequency"]'
      );
  
      this.#closeFrequencyDropdowns();
  
      if (trigger instanceof HTMLButtonElement) {
        trigger.focus();
      }
    };
  
    /**
     * Removes every parent and child line belonging to a bundle.
     *
     * @param {HTMLButtonElement} button
     */
    async #removeBundle(button) {
      const bundleId = button.dataset.bundleId;
  
      if (!bundleId || this.#busy) return;
  
      this.#setBusy(true);
  
      try {
        const cart = await this.#getCart();
  
        const bundleItems = cart.items.filter(
          (item) =>
            String(item.properties?._bundle_id) ===
            String(bundleId)
        );
  
        if (bundleItems.length === 0) {
          throw new Error(
            `Could not find bundle ${bundleId} in the cart.`
          );
        }
  
        const updates = Object.fromEntries(
          bundleItems.map(
            (item) => [item.key, 0]
          )
        );
  
        const updatedCart =
          await this.#updateCart(updates);
  
        this.#dispatchCartChange(updatedCart);
      } catch (error) {
        this.#handleError(error);
      } finally {
        this.#setBusy(false);
      }
    }
  
    /**
     * Removes a single (non-bundle) cart line by its line-item key.
     *
     * @param {HTMLButtonElement} button
     */
    async #removeLine(button) {
      const key = button.dataset.key;

      if (!key || this.#busy) return;

      this.#setBusy(true);

      try {
        const updatedCart = await this.#updateCart({
          [key]: 0,
        });

        this.#dispatchCartChange(updatedCart);
      } catch (error) {
        this.#handleError(error);
      } finally {
        this.#setBusy(false);
      }
    }

    /**
     * Opens or closes a bundle frequency dropdown.
     *
     * @param {HTMLButtonElement} button
     */
    #toggleFrequency(button) {
      const selector = button.closest(
        '[data-frequency-selector]'
      );
  
      if (!(selector instanceof HTMLElement)) {
        return;
      }
  
      const panel = selector.querySelector(
        '[data-frequency-dropdown]'
      );
  
      if (!(panel instanceof HTMLElement)) {
        return;
      }
  
      const shouldOpen = panel.hidden;
  
      this.#closeFrequencyDropdowns();
  
      panel.hidden = !shouldOpen;
  
      button.setAttribute(
        'aria-expanded',
        String(shouldOpen)
      );
    }
  
    /**
     * Changes the selling plan on a bundle (every line) or a single cart line.
     *
     * Targets a bundle when the button carries `data-bundle-id`, otherwise the
     * one line named by `data-key`. Both the frequency dropdown options and the
     * "Upgrade to Autoship" button route through here — an upgrade is just a
     * change to the monthly plan.
     *
     * @param {HTMLButtonElement} button
     */
    async #changeFrequency(button) {
      const bundleId = button.dataset.bundleId;
      const lineKey = button.dataset.key;

      // The clicked plan ('' → One Time Purchase).
      const parentPlanId =
        button.dataset.sellingPlanId || null;

      const isSubscription = Boolean(parentPlanId);

      // Per-variant "1 Month" plan ids. Each line must use its OWN plan;
      // applying the parent's plan to a child variant is rejected by the cart
      // ("Cannot apply selling plan to variant"). The upgrade button carries the
      // map itself since it sits outside the dropdown's selector element.
      const selector = button.closest('[data-frequency-selector]');
      const planMap = this.#parseJSON(
        button.dataset.subscriptionPlans ||
        (selector instanceof HTMLElement ? selector.dataset.subscriptionPlans : null),
        {}
      );

      if ((!bundleId && !lineKey) || this.#busy) return;

      this.#setBusy(true);

      try {
        const cart = await this.#getCart();

        const targetLines = bundleId
          ? cart.items.filter(
              (item) =>
                String(item.properties?._bundle_id) ===
                String(bundleId)
            )
          : cart.items.filter((item) => item.key === lineKey);

        if (!targetLines.length) {
          throw new Error(
            bundleId
              ? `Could not find any lines for bundle ${bundleId}.`
              : `Could not find cart line ${lineKey}.`
          );
        }

        // Apply the frequency to every line in the bundle (parent + flavors).
        // Changing only the parent leaves the flavor lines on the old plan,
        // producing a half-subscription bundle. All dropdown options are "1
        // Month" plans, so for a subscription each line uses its OWN mapped
        // monthly plan (a child can't accept the parent's plan); one-time drops
        // every plan (null).
        //
        // Requests are serial on purpose: /cart/change.js rewrites whole-cart
        // state, so concurrent calls clobber each other. Lines already on the
        // target plan are skipped, which is what keeps big bundles quick.
        let updatedCart;
        let firstError = null;

        for (const line of targetLines) {
          const mappedPlan = planMap[line.variant_id];
          const linePlan = isSubscription
            ? mappedPlan || parentPlanId || null
            : null;

          const currentPlan =
            line.selling_plan_allocation?.selling_plan?.id ?? null;

          if (String(currentPlan ?? '') === String(linePlan ?? '')) continue;

          try {
            updatedCart = await this.#changeLine({
              id: line.key,
              quantity: line.quantity,
              selling_plan: linePlan,
            });
          } catch (error) {
            // Keep going: bailing here would strand the bundle half-converted,
            // with no way back except another click at the same broken state.
            firstError ??= error;
          }
        }

        this.#closeFrequencyDropdowns();
        this.#dispatchCartChange(updatedCart ?? (await this.#getCart()));

        if (firstError) throw firstError;
      } catch (error) {
        this.#handleError(error);
      } finally {
        this.#setBusy(false);
      }
    }
  
    /**
     * Returns the currently open frequency selector.
     *
     * @returns {HTMLElement | null}
     */
    #getOpenFrequencySelector() {
      const panels = this.querySelectorAll(
        '[data-frequency-dropdown]'
      );
  
      for (const panel of panels) {
        if (
          panel instanceof HTMLElement &&
          !panel.hidden
        ) {
          const selector = panel.closest(
            '[data-frequency-selector]'
          );
  
          return selector instanceof HTMLElement
            ? selector
            : null;
        }
      }
  
      return null;
    }
  
    /**
     * Closes every frequency dropdown.
     */
    #closeFrequencyDropdowns() {
      this.querySelectorAll(
        '[data-frequency-selector]'
      ).forEach((selector) => {
        const trigger = selector.querySelector(
          '[data-action="toggle-frequency"]'
        );
  
        const panel = selector.querySelector(
          '[data-frequency-dropdown]'
        );
  
        if (panel instanceof HTMLElement) {
          panel.hidden = true;
        }
  
        if (trigger instanceof HTMLButtonElement) {
          trigger.setAttribute(
            'aria-expanded',
            'false'
          );
        }
      });
    }
  
    /**
     * Safely parses a JSON string, returning a fallback on failure.
     *
     * @param {string | null | undefined} value
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

    /**
     * Loads the current Shopify cart.
     *
     * @returns {Promise<object>}
     */
    async #getCart() {
      const response = await fetch(
        `${window.Shopify.routes.root}cart.js`,
        {
          headers: {
            Accept: 'application/json',
          },
        }
      );
  
      const cart = await response.json();
  
      if (!response.ok) {
        throw new Error(
          cart.description ||
          cart.message ||
          'Unable to load the cart.'
        );
      }
  
      return cart;
    }
  
    /**
     * Updates multiple cart lines by line-item key.
     *
     * @param {Record<string, number>} updates
     * @returns {Promise<object>}
     */
    async #updateCart(updates) {
      const response = await fetch(
        `${window.Shopify.routes.root}cart/update.js`,
        {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            updates,
          }),
        }
      );
  
      const cart = await response.json();
  
      if (!response.ok) {
        throw new Error(
          cart.description ||
          cart.message ||
          'Unable to update the cart.'
        );
      }
  
      return cart;
    }
  
    /**
     * Changes one cart line.
     *
     * @param {{
     *   id: string,
     *   quantity: number,
     *   selling_plan: string | null
     * }} change
     *
     * @returns {Promise<object>}
     */
    async #changeLine(change) {
      const response = await fetch(
        `${window.Shopify.routes.root}cart/change.js`,
        {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(change),
        }
      );
  
      const cart = await response.json();
  
      if (!response.ok) {
        throw new Error(
          cart.description ||
          cart.message ||
          'Unable to update the bundle frequency.'
        );
      }
  
      return cart;
    }
  
    /**
     * Notifies the theme that cart data changed.
     *
     * A listener elsewhere must perform the actual section rerender.
     *
     * @param {object} cart
     */
    #dispatchCartChange(cart) {
      document.dispatchEvent(
        new CustomEvent('cart:change', {
          bubbles: true,
          detail: {
            resource: cart,
            source: 'cart-products',
          },
        })
      );

      // Re-render the cart drawer/section. `cart-items-component` only reacts to
      // `cart:update` (CartUpdateEvent); without this the cart data changes but
      // the drawer never refreshes (e.g. frequency label + prices stay stale).
      document.dispatchEvent(
        new CartUpdateEvent(cart, 'cart-products', {
          itemCount: cart.item_count,
          source: 'cart-products',
        })
      );
    }
  
    /**
     * Locks the component while a request is running.
     *
     * @param {boolean} busy
     */
    #setBusy(busy) {
      this.#busy = busy;
  
      this.setAttribute(
        'aria-busy',
        String(busy)
      );
  
      this.classList.toggle(
        'cart-items-disabled',
        busy
      );
  
      this.querySelectorAll(
        'button[data-action]'
      ).forEach((button) => {
        if (!(button instanceof HTMLButtonElement)) {
          return;
        }
  
        button.disabled = busy;
      });
    }
  
    /**
     * Emits a cart error that can be handled by the theme UI.
     *
     * @param {unknown} error
     */
    #handleError(error) {
      console.error(error);
  
      document.dispatchEvent(
        new CustomEvent('cart:error', {
          bubbles: true,
          detail: {
            message:
              error instanceof Error
                ? error.message
                : 'The cart could not be updated.',
          },
        })
      );
    }
  }
  
  if (
    !customElements.get(
      'cart-products-component'
    )
  ) {
    customElements.define(
      'cart-products-component',
      CartProductsComponent
    );
  }