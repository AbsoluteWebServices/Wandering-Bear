import { Component } from '@theme/component';
import { onAnimationEnd } from '@theme/utilities';
import { ThemeEvents } from '@theme/events';

class CartIcon extends Component {
  requiredRefs = ['cartBubble', 'cartBubbleText', 'cartBubbleCount'];

  get currentCartCount() {
    return parseInt(this.refs.cartBubbleCount.textContent ?? '0', 10);
  }

  set currentCartCount(value) {
    this.refs.cartBubbleCount.textContent = value < 100 ? String(value) : '';
  }

  connectedCallback() {
    super.connectedCallback();

    document.addEventListener(ThemeEvents.cartUpdate, this.onCartUpdate);
    window.addEventListener('pageshow', this.onPageShow);

    this.ensureCartBubbleIsCorrect();
  }

  disconnectedCallback() {
    super.disconnectedCallback();

    document.removeEventListener(ThemeEvents.cartUpdate, this.onCartUpdate);
    window.removeEventListener('pageshow', this.onPageShow);
  }

  onPageShow = (event) => {
    if (event.persisted) {
      this.ensureCartBubbleIsCorrect();
    }
  };

  onCartUpdate = async () => {
    await this.renderCartBubble(true);
  };

  /**
   * Fetches the current cart and renders the count.
   * Free items are excluded.
   *
   * @param {boolean} animate
   */
  renderCartBubble = async (animate = true) => {
    const response = await fetch('/cart.js');

    if (!response.ok) {
      throw new Error(`Unable to fetch cart: ${response.status}`);
    }

    const cart = await response.json();

    const itemCount = cart.items.reduce((count, item) => {
      return item.final_line_price > 0
        ? count + item.quantity
        : count;
    }, 0);

    this.refs.cartBubbleCount.classList.toggle('hidden', itemCount === 0);
    this.refs.cartBubble.classList.toggle('visually-hidden', itemCount === 0);
    this.classList.toggle(
      'header-actions__cart-icon--has-cart',
      itemCount > 0
    );

    this.currentCartCount = itemCount;

    sessionStorage.setItem(
      'cart-count',
      JSON.stringify({
        value: String(itemCount),
        timestamp: Date.now(),
      })
    );

    if (!animate || itemCount === 0) return;

    await new Promise((resolve) => requestAnimationFrame(resolve));

    this.refs.cartBubble.classList.add('cart-bubble--animating');
    await onAnimationEnd(this.refs.cartBubbleText);
    this.refs.cartBubble.classList.remove('cart-bubble--animating');
  };

  ensureCartBubbleIsCorrect = async () => {
    if (!this.refs.cartBubbleCount) return;

    // Fetch the real cart instead of feeding the stored count
    // back into the calculation.
    await this.renderCartBubble(false);
  };
}

if (!customElements.get('cart-icon')) {
  customElements.define('cart-icon', CartIcon);
}