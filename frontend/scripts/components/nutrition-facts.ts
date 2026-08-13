import { Alpine as AlpineType } from 'alpinejs'

/**
 * Nutrition Facts modal flavor switcher.
 *
 * Flavors are separate products (see flavor-selector / product_group). The modal
 * markup renders one nutrition-label + ingredients block per flavor and toggles
 * them with x-show based on `selected`.
 *
 * Desktop: custom WAI-ARIA listbox (button + role="listbox").
 * Mobile: a native <select> bound to the same `selected` state (iOS wheel picker).
 *
 * Options are read from the DOM (each carries data-flavor-slug), so Liquid stays
 * the single source of truth and we avoid duplicating flavor data as JSON.
 */
export default (Alpine: AlpineType) => {
  Alpine.data('nutritionFacts', (config: { initial?: string } = {}) => ({
    selected: config.initial || '',
    open: false,

    init() {
      const slugs = this.optionSlugs()
      this.selected = this.resolveInitial(slugs) || slugs[0] || ''
    },

    /**
     * Resolve which flavor to show first, in priority order:
     *  1. ?product=<handle> URL param (overview / flavor landing pages)
     *  2. the flavor currently selected on the PDP (flavor-selector radios)
     *  3. the server-seeded current product handle (config.initial)
     * Falls back to the first option when none match.
     */
    resolveInitial(slugs: string[]): string {
      try {
        const param = new URLSearchParams(window.location.search).get('product')
        if (param && slugs.includes(param)) return param
      } catch (e) {
        /* no-op: window.location may be unavailable */
      }

      // Non-bundle templates: flavor-selector radios carry the selected slug.
      const checked = document.querySelector<HTMLInputElement>('input[name="flavor"]:checked')
      if (checked && slugs.includes(checked.value)) return checked.value

      // Bundle templates: the chosen flavor is marked with .selected-product
      // (updated live by productFormBundle). Match its product id to an option.
      const selectedEl = document.querySelector<HTMLElement>('.selected-product[data-product-id]')
      const selectedId = selectedEl?.dataset.productId
      if (selectedId) {
        const match = this.options().find((o) => o.dataset.flavorId === selectedId)
        const slug = match?.dataset.flavorSlug
        if (slug && slugs.includes(slug)) return slug
      }

      // Server-seeded current product handle (config.initial).
      if (this.selected && slugs.includes(this.selected)) return this.selected

      return ''
    },

    options(): HTMLElement[] {
      // Query from $el (available during init) rather than $refs, whose child
      // refs aren't reliably populated when init() runs.
      const root = this.$el as HTMLElement
      return Array.from(root.querySelectorAll<HTMLElement>('[role="option"]'))
    },

    optionSlugs(): string[] {
      return this.options().map((o) => o.dataset.flavorSlug || '')
    },

    toggle() {
      this.open ? this.close() : this.openMenu()
    },

    openMenu() {
      this.open = true
      this.$nextTick(() => {
        const opts = this.options()
        const target = opts.find((o) => o.dataset.flavorSlug === this.selected) || opts[0]
        target?.focus()
      })
    },

    close(refocusTrigger = false) {
      if (!this.open) return
      this.open = false
      if (refocusTrigger) (this.$refs.trigger as HTMLElement | undefined)?.focus()
    },

    select(slug: string) {
      this.selected = slug
      this.close(true)
    },

    onTriggerKey(event: KeyboardEvent) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
        event.preventDefault()
        this.openMenu()
      }
    },

    onOptionKey(event: KeyboardEvent, slug: string) {
      const opts = this.options()
      const index = opts.indexOf(event.currentTarget as HTMLElement)

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault()
          opts[(index + 1) % opts.length]?.focus()
          break
        case 'ArrowUp':
          event.preventDefault()
          opts[(index - 1 + opts.length) % opts.length]?.focus()
          break
        case 'Home':
          event.preventDefault()
          opts[0]?.focus()
          break
        case 'End':
          event.preventDefault()
          opts[opts.length - 1]?.focus()
          break
        case 'Enter':
        case ' ':
          event.preventDefault()
          this.select(slug)
          break
        case 'Escape':
          event.preventDefault()
          this.close(true)
          break
        case 'Tab':
          this.close()
          break
      }
    },
  }))
}
