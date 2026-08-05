/**
 * Accessible custom dropdown (WAI-ARIA listbox) for the simple variant picker.
 *
 * Enhances the markup rendered by `snippets/variant-main-picker.liquid` (dropdowns style):
 *   [data-variant-select]
 *     > button[data-variant-select-trigger][aria-haspopup="listbox"]
 *     > fieldset[data-variant-select-listbox][role="listbox"]
 *         > label[data-variant-select-option][role="option"] > input[type=radio] (hidden)
 *
 * Selecting an option checks the matching hidden radio and dispatches a bubbling `change`
 * event, so the native <variant-picker> wiring (variant-picker.js) performs the variant
 * update. This layer only owns presentation, keyboard interaction and focus management.
 *
 * Listeners are delegated on `document`, so behaviour survives the variant picker's DOM
 * morphing on variant change without any re-initialisation.
 */

const SELECT = '[data-variant-select]';
const TRIGGER = '[data-variant-select-trigger]';
const OPTION = '[data-variant-select-option]';
const VALUE = '[data-variant-select-value]';

const TYPEAHEAD_RESET_MS = 500;
/** @type {WeakMap<Element, { str: string, at: number }>} */
const typeaheadState = new WeakMap();

/**
 * @param {Element} root
 */
function getParts(root) {
  return {
    trigger: /** @type {HTMLButtonElement | null} */ (root.querySelector(TRIGGER)),
    value: root.querySelector(VALUE),
    options: /** @type {HTMLElement[]} */ (Array.from(root.querySelectorAll(OPTION))),
  };
}

/**
 * @param {Element} root
 */
function isOpen(root) {
  return root.querySelector(TRIGGER)?.getAttribute('aria-expanded') === 'true';
}

/**
 * @param {Element} root
 * @param {boolean} [focusActive]
 */
function open(root, focusActive = true) {
  closeAll(root);
  const { trigger, options } = getParts(root);
  if (!trigger) return;
  trigger.setAttribute('aria-expanded', 'true');
  root.classList.add('variant-select--open');
  if (!focusActive) return;
  const active = options.find((option) => option.getAttribute('aria-selected') === 'true') || options[0];
  if (active) focusOption(options, active);
}

/**
 * @param {Element} root
 * @param {boolean} [returnFocus]
 */
function close(root, returnFocus = false) {
  const trigger = root.querySelector(TRIGGER);
  if (!trigger) return;
  trigger.setAttribute('aria-expanded', 'false');
  root.classList.remove('variant-select--open');
  if (returnFocus && trigger instanceof HTMLElement) trigger.focus();
}

/**
 * @param {Element | null} except
 */
function closeAll(except) {
  document.querySelectorAll(SELECT).forEach((root) => {
    if (root !== except) close(root);
  });
}

/**
 * Roving tabindex: only the active option is tabbable, and it receives DOM focus so
 * screen readers announce it.
 * @param {HTMLElement[]} options
 * @param {HTMLElement} option
 */
function focusOption(options, option) {
  options.forEach((candidate) => candidate.setAttribute('tabindex', candidate === option ? '0' : '-1'));
  option.focus();
}

/**
 * @param {Element} root
 * @param {HTMLElement} option
 */
function selectOption(root, option) {
  const { value, options } = getParts(root);
  const input = /** @type {HTMLInputElement | null} */ (option.querySelector('input[type="radio"]'));
  if (!input) return;

  options.forEach((candidate) => {
    const selected = candidate === option;
    candidate.setAttribute('aria-selected', selected ? 'true' : 'false');
    candidate.setAttribute('tabindex', selected ? '0' : '-1');
  });

  if (value) value.textContent = option.dataset.valueText ?? (option.textContent || '').trim();

  if (!input.checked) {
    input.checked = true;
    // Bubbles to <variant-picker>, which runs the native variant-change flow.
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  close(root, true);
}

/**
 * @param {Element} root
 * @param {string} char
 */
function typeahead(root, char) {
  const { options } = getParts(root);
  const now = Date.now();
  const previous = typeaheadState.get(root);
  const str = previous && now - previous.at < TYPEAHEAD_RESET_MS ? previous.str + char : char;
  typeaheadState.set(root, { str, at: now });

  const query = str.toLowerCase();
  const match = options.find((option) =>
    (option.dataset.valueText ?? option.textContent ?? '').trim().toLowerCase().startsWith(query)
  );
  if (match) focusOption(options, match);
}

document.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;

  const trigger = target.closest(TRIGGER);
  if (trigger) {
    const root = trigger.closest(SELECT);
    if (!root) return;
    event.preventDefault();
    if (isOpen(root)) close(root);
    else open(root);
    return;
  }

  const option = target.closest(OPTION);
  if (option instanceof HTMLElement) {
    const root = option.closest(SELECT);
    if (!root) return;
    // Prevent the wrapping <label> from natively toggling the radio (we do it explicitly).
    event.preventDefault();
    selectOption(root, option);
    return;
  }

  // Click outside any open dropdown closes them all.
  closeAll(null);
});

document.addEventListener('keydown', (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;

  const trigger = target.closest(TRIGGER);
  if (trigger) {
    const root = trigger.closest(SELECT);
    if (!root) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      open(root);
    }
    return;
  }

  const option = target.closest(OPTION);
  if (!(option instanceof HTMLElement)) return;
  const root = option.closest(SELECT);
  if (!root) return;
  const { options } = getParts(root);
  const index = options.indexOf(option);

  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault();
      focusOption(options, options[Math.min(index + 1, options.length - 1)]);
      break;
    case 'ArrowUp':
      event.preventDefault();
      focusOption(options, options[Math.max(index - 1, 0)]);
      break;
    case 'Home':
      event.preventDefault();
      focusOption(options, options[0]);
      break;
    case 'End':
      event.preventDefault();
      focusOption(options, options[options.length - 1]);
      break;
    case 'Enter':
    case ' ':
      event.preventDefault();
      selectOption(root, option);
      break;
    case 'Escape':
      event.preventDefault();
      close(root, true);
      break;
    case 'Tab':
      close(root);
      break;
    default:
      if (event.key.length === 1 && /\S/.test(event.key)) {
        event.preventDefault();
        typeahead(root, event.key);
      }
  }
});
