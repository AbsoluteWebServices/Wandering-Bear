import { Component } from '@theme/component';
import { debounce, isClickedOutside, onAnimationEnd } from '@theme/utilities';

/**
 * A custom element that manages a dialog.
 *
 * @typedef {object} Refs
 * @property {HTMLDialogElement} dialog – The dialog element.
 *
 * @extends Component<Refs>
 */
const FOCUSABLE_SELECTOR =
  'a[href], button:enabled, input:not([type=hidden]):enabled, select:enabled, textarea:enabled, summary, [tabindex]:not([tabindex^="-"])';

/**
 * Tabbable elements inside a container, in document order.
 *
 * Skips `inert` subtrees and anything not rendered, so callers never land focus
 * on a control the user cannot see.
 *
 * @param {Element} container
 * @returns {HTMLElement[]}
 */
function getFocusableWithin(container) {
  return /** @type {HTMLElement[]} */ (
    Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
      (element) => !element.closest('[inert]') && (element.checkVisibility?.() ?? true)
    )
  );
}

export class DialogComponent extends Component {
  requiredRefs = ['dialog'];

  connectedCallback() {
    super.connectedCallback();

    if (this.minWidth || this.maxWidth) {
      window.addEventListener('resize', this.#handleResize);
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.minWidth || this.maxWidth) {
      window.removeEventListener('resize', this.#handleResize);
    }
  }

  #handleResize = debounce(() => {
    const { minWidth, maxWidth } = this;

    if (!minWidth && !maxWidth) return;

    const windowWidth = window.innerWidth;
    if (windowWidth < minWidth || windowWidth > maxWidth) {
      this.closeDialog();
    }
  }, 50);

  #previousScrollY = 0;

  /**
   * Shows the dialog.
   */
  showDialog() {
    const { dialog } = this.refs;

    // `open` is only an attribute and does not mean modal. A dialog carrying it
    // without showModal() renders normally but has no backdrop, no Escape and no
    // focus containment, so re-open it rather than treating it as already shown.
    if (dialog.open) {
      if (dialog.matches(':modal')) return;
      dialog.close();
    }

    const scrollY = window.scrollY;
    this.#previousScrollY = scrollY;

    // Prevent layout thrashing by separating DOM reads from DOM writes
    requestAnimationFrame(() => {
      document.body.style.width = '100%';
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;

      dialog.showModal();

      document.addEventListener('focusin', this.#enforceFocus, true);

      this.dispatchEvent(new DialogOpenEvent());

      this.addEventListener('click', this.#handleClick);
      this.addEventListener('keydown', this.#handleKeyDown);
    });
  }

  /**
   * Closes the dialog.
   */
  closeDialog = async () => {
    const { dialog } = this.refs;

    if (!dialog.open) return;

    this.removeEventListener('click', this.#handleClick);
    this.removeEventListener('keydown', this.#handleKeyDown);

    document.removeEventListener('focusin', this.#enforceFocus, true);

    // Force browser to restart animation by resetting it
    // Temporarily remove any existing animation state
    dialog.style.animation = 'none';

    // Force a reflow
    void dialog.offsetWidth;

    // Now add the closing class and restore animation
    dialog.classList.add('dialog-closing');
    dialog.style.animation = '';

    await onAnimationEnd(dialog, undefined, {
      subtree: false,
    });

    document.body.style.width = '';
    document.body.style.position = '';
    document.body.style.top = '';
    window.scrollTo({ top: this.#previousScrollY, behavior: 'instant' });

    dialog.close();
    dialog.classList.remove('dialog-closing');

    this.dispatchEvent(new DialogCloseEvent());
  };

  /**
   * Toggles the dialog.
   */
  toggleDialog = () => {
    if (this.refs.dialog.open) {
      this.closeDialog();
    } else {
      this.showDialog();
    }
  };

  /**
   * Pulls focus back when it escapes an open dialog.
   *
   * @param {FocusEvent} event
   */
  #enforceFocus = (event) => {
    const { dialog } = this.refs;
    const { target } = event;

    if (!dialog.open || !(target instanceof Node)) return;
    if (dialog.contains(target)) return;

    event.stopPropagation();

    const focusable = getFocusableWithin(dialog)[0];

    if (focusable) {
      focusable.focus();
    } else {
      dialog.focus();
    }
  };

  /**
   * Closes the dialog when the user clicks outside of it.
   *
   * @param {MouseEvent} event - The mouse event.
   */
  #handleClick(event) {
    const { dialog } = this.refs;

    if (isClickedOutside(event, dialog)) {
      this.closeDialog();
    }
  }

  /**
   * Closes the dialog when the user presses the escape key.
   *
   * @param {KeyboardEvent} event - The keyboard event.
   */
  #handleKeyDown(event) {
    if (event.key !== 'Escape') return;

    event.preventDefault();
    this.closeDialog();
  }

  /**
   * Gets the minimum width of the dialog.
   *
   * @returns {number} The minimum width of the dialog.
   */
  get minWidth() {
    return Number(this.getAttribute('dialog-active-min-width'));
  }

  /**
   * Gets the maximum width of the dialog.
   *
   * @returns {number} The maximum width of the dialog.
   */
  get maxWidth() {
    return Number(this.getAttribute('dialog-active-max-width'));
  }
}

if (!customElements.get('dialog-component')) customElements.define('dialog-component', DialogComponent);

export class DialogOpenEvent extends CustomEvent {
  constructor() {
    super(DialogOpenEvent.eventName);
  }

  static eventName = 'dialog:open';
}

export class DialogCloseEvent extends CustomEvent {
  constructor() {
    super(DialogCloseEvent.eventName);
  }

  static eventName = 'dialog:close';
}

document.addEventListener(
  'toggle',
  (event) => {
    if (event.target instanceof HTMLDetailsElement) {
      if (event.target.hasAttribute('scroll-lock')) {
        const { open } = event.target;
        if (open) {
          document.documentElement.setAttribute('scroll-lock', '');
        } else {
          document.documentElement.removeAttribute('scroll-lock');
        }
      }
    }
  },
  { capture: true }
);

/**
 * Keeps Tab inside whichever modal dialog holds focus.
 *
 * showModal() confines focus to the document, not to the dialog, so tabbing past
 * either end hands focus to the browser's own UI. That transition fires no event
 * a page can observe, which is why it has to be prevented rather than corrected.
 *
 * Global on purpose: DialogComponent is only one of several callers of
 * showModal() (aw-membership-signup-modal, aw-modal, member-login-modal and
 * zoom-dialog each do their own). Keys handled elsewhere are skipped.
 */
document.addEventListener('keydown', (event) => {
  if (event.defaultPrevented || event.key !== 'Tab') return;

  const active = document.activeElement;
  const dialog = active instanceof Element ? active.closest('dialog[open]') : null;

  // Non-modal dialogs are just part of the page and should tab like it.
  if (!dialog || !dialog.matches(':modal')) return;

  const focusable = getFocusableWithin(dialog);
  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (!first || !last) return;

  if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  } else if (event.shiftKey && (active === first || active === dialog)) {
    event.preventDefault();
    last.focus();
  }
});
