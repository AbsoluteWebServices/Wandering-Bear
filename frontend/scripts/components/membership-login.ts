import { Alpine as AlpineType } from 'alpinejs'

/**
 * Bridges the membership ("flavor access") modal to the eager member-login modal.
 *
 * The store requires a CAPTCHA on customer login, which Shopify binds only to
 * forms present in the real DOM at page load. The membership modal is rendered
 * inside an Alpine `x-if` template, so its form can't be reliably protected —
 * instead the actual login form lives in member-login-modal.liquid (rendered
 * eagerly at page load) and submits natively. This component just intercepts the
 * modal's metafield "Login" link and hands off to that dialog.
 */
export default (Alpine: typeof AlpineType) => {
  Alpine.data('membershipLogin', () => ({
    /**
     * The "Login" link lives inside a metafield rich-text field, so we can't put
     * `@click` on the anchor itself — delegate from its container instead.
     */
    onLoginLink(event: Event) {
      const anchor = (event.target as HTMLElement)?.closest?.('a')
      if (!anchor) return

      const href = anchor.getAttribute('href') || ''
      if (/\/account(\/login)?(?:[/?#]|$)/.test(href)) {
        event.preventDefault()
        // Open the eager, CAPTCHA-protected login dialog and close this modal.
        window.dispatchEvent(new CustomEvent('open-member-login'))
        window.dispatchEvent(new CustomEvent('modal-close'))
      }
    },
  }))
}
