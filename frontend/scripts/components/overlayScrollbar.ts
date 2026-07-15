import { OverlayScrollbars } from 'overlayscrollbars'

const DESKTOP_MIN_WIDTH = 1280
const DESKTOP_MEDIA_QUERY = `(min-width: ${DESKTOP_MIN_WIDTH}px)`

type OsInstance = Exclude<ReturnType<typeof OverlayScrollbars>, undefined>

export default (Alpine: any) => {
  Alpine.data('overlayScrollbar', () => {
    const instances = new Map<HTMLElement, OsInstance>()
    let syncScheduled = false
    let mediaQuery: MediaQueryList | null = null
    let onViewportChangeBound: (() => void) | null = null

    return {
      init() {
        onViewportChangeBound = () => this.onViewportChange()
        mediaQuery = window.matchMedia(DESKTOP_MEDIA_QUERY)

        if (typeof mediaQuery.addEventListener === 'function') {
          mediaQuery.addEventListener('change', onViewportChangeBound)
        } else {
          mediaQuery.addListener(onViewportChangeBound)
        }

        window.addEventListener('resize', onViewportChangeBound, { passive: true })
        window.addEventListener('orientationchange', onViewportChangeBound, {
          passive: true,
        })

        this.scheduleSync()
        window.setTimeout(() => this.scheduleSync(), 0)
      },

      destroy() {
        if (!onViewportChangeBound) return

        if (mediaQuery) {
          if (typeof mediaQuery.removeEventListener === 'function') {
            mediaQuery.removeEventListener('change', onViewportChangeBound)
          } else {
            mediaQuery.removeListener(onViewportChangeBound)
          }
        }

        window.removeEventListener('resize', onViewportChangeBound)
        window.removeEventListener('orientationchange', onViewportChangeBound)

        this.destroyAllTracked()
        onViewportChangeBound = null
        mediaQuery = null
      },

      isDesktopViewport() {
        return window.innerWidth >= DESKTOP_MIN_WIDTH
      },

      getOverlayInstance(element: HTMLElement): OsInstance | null {
        const fromMap = instances.get(element)
        if (fromMap && OverlayScrollbars.valid(fromMap)) return fromMap

        const fromApi = OverlayScrollbars(element)
        if (fromApi && OverlayScrollbars.valid(fromApi)) return fromApi

        return null
      },

      hardResetFlavorContainer(element: HTMLElement) {
        const instance = this.getOverlayInstance(element)

        if (instance) {
          instance.destroy()
        }

        instances.delete(element)

        const viewport = element.querySelector<HTMLElement>(
          '[data-overlayscrollbars-viewport]'
        )

        if (viewport) {
          const fragment = document.createDocumentFragment()
          while (viewport.firstChild) {
            fragment.appendChild(viewport.firstChild)
          }
          element.replaceChildren(fragment)
        }

        element
          .querySelectorAll('.os-scrollbar, [data-overlayscrollbars-padding]')
          .forEach((node) => node.remove())

        ;[
          'data-overlayscrollbars',
          'data-overlayscrollbars-initialize',
        ].forEach((attr) => element.removeAttribute(attr))

        element.style.overflowY = ''
        element.style.overflowX = ''
      },

      destroyAllTracked() {
        for (const element of [...instances.keys()]) {
          this.hardResetFlavorContainer(element)
        }
        instances.clear()
      },

      initFlavorScrollbar(element: HTMLElement) {
        if (!this.isDesktopViewport()) {
          this.hardResetFlavorContainer(element)
          return
        }

        const existing = this.getOverlayInstance(element)
        if (existing) {
          instances.set(element, existing)
          existing.update(true)
          return
        }

        const instance = OverlayScrollbars(element, {
          overflow: { x: 'hidden', y: 'scroll' },
          scrollbars: {
            theme: 'os-theme-wb-flavor',
            autoHide: 'never',
            autoHideSuspend: true,
            dragScroll: true,
            clickScroll: true,
            pointers: ['mouse', 'pen'],
          },
        })

        instances.set(element, instance)
      },

      syncFlavorScrollbars(root: ParentNode = this.$el) {
        const containers = root.querySelectorAll<HTMLElement>('.flavor-container')

        if (!this.isDesktopViewport()) {
          this.destroyAllTracked()
          containers.forEach((element) => this.hardResetFlavorContainer(element))
          return
        }

        containers.forEach((element) => this.initFlavorScrollbar(element))
      },

      scheduleSync(root?: ParentNode) {
        if (syncScheduled) return
        syncScheduled = true

        requestAnimationFrame(() => {
          syncScheduled = false
          this.syncFlavorScrollbars(root ?? this.$el)
        })
      },

      onViewportChange() {
        if (!this.isDesktopViewport()) {
          this.destroyAllTracked()
          this.$el
            .querySelectorAll<HTMLElement>('.flavor-container')
            .forEach((element: HTMLElement) =>
              this.hardResetFlavorContainer(element)
            )
          return
        }

        this.scheduleSync()
      },
    }
  })
}
