import { Alpine as AlpineType } from 'alpinejs'
import { CartAddEvent, CartErrorEvent } from '/assets/events'

export default (Alpine: AlpineType) => {
  Alpine.data('eliteAtc', () => ({
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

    async addEliteToCart(
      variantId: number,
      quantity = 1,
      sellingPlanId: number | null = null
    ) {
      const sectionIds = this.getCartSectionIds()
      const cartItem: Record<string, unknown> = {
        id: variantId,
        quantity,
        selling_plan: sellingPlanId,
      }

      if (sectionIds.length > 0) {
        cartItem.sections = sectionIds.join(',')
        cartItem.sections_url = window.location.pathname + window.location.search
      }

      const res = await fetch('/cart/add.js', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(cartItem),
      })

      const addResponse = await res.json()

      if (!res.ok || addResponse.status) {
        const errorText = addResponse.description || addResponse.message || 'ATC failed'

        document.dispatchEvent(
          new CartErrorEvent('elite-atc', 'ATC failed', errorText)
        )

        return
      }

      const cart = await fetch('/cart.js').then((r) => r.json())

      document.dispatchEvent(
        new CartAddEvent(cart, 'elite-atc', {
          source: 'elite-atc',
          itemCount: cart.item_count,
          variantId: String(variantId),
          sections: addResponse.sections,
        })
      )

      this.openCartDrawer()
    },
  }))
}
