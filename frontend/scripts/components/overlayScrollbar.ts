import { OverlayScrollbars } from 'overlayscrollbars'

const instances = new WeakMap<HTMLElement, ReturnType<typeof OverlayScrollbars>>()

function initFlavorScrollbar(element: HTMLElement) {
  const existingInstance = instances.get(element)

  if (existingInstance) {
    existingInstance.update(true)
    return
  }

  const instance = OverlayScrollbars(
    { target: element },
    {
      overflow: { x: 'hidden', y: 'scroll' },
      scrollbars: {
        theme: 'os-theme-wb-flavor',
        autoHide: 'never',
        autoHideSuspend: true,
        dragScroll: true,
        clickScroll: true,
        pointers: ['mouse', 'touch', 'pen'],
      },
    }
  )

  instances.set(element, instance)
}

function initFlavorScrollbars(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>('.flavor-container').forEach((element) => {
    initFlavorScrollbar(element)
  })
}

export default (Alpine: any) => {
  Alpine.data('overlayScrollbar', () => ({
    init() {
      initFlavorScrollbars(this.$el)
    },
  }))

  document.addEventListener('alpine:initialized', () => {
    initFlavorScrollbars()
  })

  document.addEventListener('shopify:section:load', (event) => {
    if (event.target instanceof HTMLElement) {
      initFlavorScrollbars(event.target)
    }
  })
}
