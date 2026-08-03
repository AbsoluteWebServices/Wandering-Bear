import { Alpine as AlpineType } from 'alpinejs'
import { CartAddEvent, CartErrorEvent } from '/assets/events'

type EliteConfig = { variantId?: number; sellingPlan?: number | null }

export default (Alpine: AlpineType) => {
  Alpine.data('eliteAtc', (config: EliteConfig = {}) => ({
    variantId: config.variantId ?? 0,
    sellingPlan: config.sellingPlan ?? null,
    inCart: false,
    busy: false,

    /** On load, reflect whether the Elite product is already in the cart so the button shows the
     *  "added" state instead of letting the member add it twice. */
    async init() {
      if (!this.variantId) return
      try {
        const cart = await fetch('/cart.js').then((r) => r.json())
        this.inCart =
          Array.isArray(cart.items) &&
          cart.items.some((i: { variant_id: number }) => i.variant_id === this.variantId)
      } catch {
        /* cart unreachable — leave inCart false */
      }
    },

    getCartSectionIds() {
      const sectionIds = new Set<string>()
      document.querySelectorAll('cart-items-component').forEach((item) => {
        if (item instanceof HTMLElement && item.dataset.sectionId) {
          sectionIds.add(item.dataset.sectionId)
        }
      })
      return Array.from(sectionIds)
    },

    openCartDrawer() {
      const cartDrawer = document.querySelector('cart-drawer-component') as
        | (HTMLElement & { open?: () => void })
        | null
      cartDrawer?.open?.()
    },

    async addToCart() {
      if (this.inCart || this.busy || !this.variantId) return
      this.busy = true
      try {
        const sectionIds = this.getCartSectionIds()
        const cartItem: Record<string, unknown> = {
          id: this.variantId,
          quantity: 1,
          selling_plan: this.sellingPlan,
        }
        if (sectionIds.length > 0) {
          cartItem.sections = sectionIds.join(',')
          cartItem.sections_url = window.location.pathname + window.location.search
        }

        const res = await fetch('/cart/add.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(cartItem),
        })
        const addResponse = await res.json()

        if (!res.ok || addResponse.status) {
          const errorText = addResponse.description || addResponse.message || 'ATC failed'
          document.dispatchEvent(new CartErrorEvent('elite-atc', 'ATC failed', errorText))
          return
        }

        this.inCart = true
        const cart = await fetch('/cart.js').then((r) => r.json())
        document.dispatchEvent(
          new CartAddEvent(cart, 'elite-atc', {
            source: 'elite-atc',
            itemCount: cart.item_count,
            variantId: String(this.variantId),
            sections: addResponse.sections,
          })
        )
        this.openCartDrawer()
      } finally {
        this.busy = false
      }
    },
  }))
}
