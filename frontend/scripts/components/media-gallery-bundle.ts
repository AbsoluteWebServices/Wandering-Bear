import { Alpine as AlpineType } from 'alpinejs'
import Swiper from 'swiper'
import { Keyboard, Zoom } from 'swiper/modules'

export default (Alpine: typeof AlpineType) => {
  Alpine.data('mediaGalleryBundle', () => {
    let resizeObserver: ResizeObserver | null = null
    let lastWrapperWidth = 0
    let lockingHeight = false
    let onProductChanged: ((event: Event) => void) | null = null
    let resizeTimer: ReturnType<typeof setTimeout> | null = null

    return {
      selectedProduct: null as any,
      swiper: null as Swiper | null,
      swiperThumbs: null as Swiper | null,

      _getMediaWrapper(): HTMLElement | null {
        if (this.$el?.hasAttribute?.('data-media-gallery-bundle-container')) {
          return this.$el as HTMLElement
        }

        return (
          (this.$el?.querySelector?.(
            '[data-media-gallery-bundle-container]'
          ) as HTMLElement | null) ??
          (this.$el?.closest?.(
            '[data-media-gallery-bundle-container]'
          ) as HTMLElement | null) ??
          document.querySelector<HTMLElement>(
            '[data-media-gallery-bundle-container]'
          )
        )
      },

      _getLockTarget(): HTMLElement | null {
        if (this.$el?.classList?.contains('product-information__media')) {
          return this.$el as HTMLElement
        }

        const mediaColumn = this.$el?.closest?.(
          '.product-information__media'
        ) as HTMLElement | null

        return mediaColumn ?? this._getMediaWrapper()
      },

      async _waitForImages(root: ParentNode) {
        const images = Array.from(root.querySelectorAll('img'))

        await Promise.all(
          images.map((img) => {
            if (img.complete) return Promise.resolve()

            return new Promise<void>((resolve) => {
              img.addEventListener('load', () => resolve(), { once: true })
              img.addEventListener('error', () => resolve(), { once: true })
            })
          })
        )
      },

      /**
       * @param allowShrink - false during product swaps so the page never jumps up
       *   when the next gallery is shorter. true on resize so layout can tighten.
       */
      lockHeight(allowShrink = true) {
        const target = this._getLockTarget()
        if (!target) return

        lockingHeight = true

        const previousPx = parseFloat(target.style.height) || 0
        target.style.height = ''
        const measured = target.offsetHeight
        const next = allowShrink
          ? measured
          : Math.max(previousPx, measured)

        target.style.height = next > 0 ? `${next}px` : previousPx ? `${previousPx}px` : ''
        lastWrapperWidth = this._getMediaWrapper()?.offsetWidth ?? 0

        requestAnimationFrame(() => {
          lockingHeight = false
        })
      },

      async settleGalleryHeight(allowShrink = true) {
        const mediaWrapper = this._getMediaWrapper()
        if (!mediaWrapper) return

        await this._waitForImages(mediaWrapper)
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        })
        this.lockHeight(allowShrink)
      },

      _bindResizeObserver() {
        const mediaWrapper = this._getMediaWrapper()
        if (!mediaWrapper || typeof ResizeObserver === 'undefined') return

        resizeObserver?.disconnect()
        lastWrapperWidth = mediaWrapper.offsetWidth

        resizeObserver = new ResizeObserver((entries) => {
          if (lockingHeight) return

          const entry = entries[0]
          if (!entry) return

          const nextWidth = Math.round(entry.contentRect.width)
          if (nextWidth === lastWrapperWidth) return

          lastWrapperWidth = nextWidth

          if (resizeTimer) clearTimeout(resizeTimer)
          resizeTimer = setTimeout(() => this.lockHeight(true), 100)
        })

        resizeObserver.observe(mediaWrapper)
      },

      _initSwiperThumbs(thumbsEl: HTMLElement) {
        if (this.swiperThumbs) {
          this.swiperThumbs.destroy(true, true)
          this.swiperThumbs = null
        }

        this.swiperThumbs = new Swiper(thumbsEl, {
          slidesPerView: 5,
          spaceBetween: 6,
          watchSlidesProgress: true,
          modules: [Keyboard],
          keyboard: true,
          breakpoints: {
            1024: {
              slidesPerView: 5,
              spaceBetween: 10,
            },
          },
        })
      },

      _initSwiper() {
        if (this.swiper) {
          this.swiper.destroy(true, true)
          this.swiper = null
        }

        const mediaWrapper = this._getMediaWrapper() ?? this.$el
        const mainEl =
          mediaWrapper?.querySelector?.<HTMLElement>('.swiper-main') ?? null
        const thumbsEl =
          mediaWrapper?.querySelector?.<HTMLElement>('.swiper-thumbs') ?? null

        if (!mainEl) return

        if (thumbsEl) {
          this._initSwiperThumbs(thumbsEl)
        }

        // Only loop when the real slide count allows it.
        const slideCount = mainEl.querySelectorAll(
          '.swiper-slide:not(.swiper-slide-duplicate)'
        ).length
        const enableLoop = slideCount > 2

        this.swiper = new Swiper(mainEl, {
          slidesPerView: 1.12,
          centeredSlides: true,
          modules: [Keyboard, Zoom],
          keyboard: true,
          loop: enableLoop,
          spaceBetween: 10,
          zoom: {
            maxRatio: 2,
            minRatio: 1,
          },
          on: {
            click: function (swiper,event) {
              swiper.zoom.toggle(event)
            }
          },
          breakpoints: {
            1023: {
              slidesPerView: 1,
              centeredSlides: false,
              spaceBetween: 0,
            },
          },
          thumbs: this.swiperThumbs
            ? {
                swiper: this.swiperThumbs,
              }
            : undefined,
        })
      },

      async init() {
        onProductChanged = (event: Event) => {
          this.selectedProduct = (event as CustomEvent).detail.product
          this.renderGallery(this.selectedProduct)
        }

        window.addEventListener('product-changed', onProductChanged)

        window.addEventListener('gallery-slide-to', ((event: CustomEvent) => {
          const position = event.detail?.position
          if (position != null && this.swiper) {

            const slideIndex = position - 1
            if (slideIndex >= 0) {
              this.swiper.slideToLoop(slideIndex)
            }
          }
        }) as EventListener)

        this._initSwiper()
        this._bindResizeObserver()
        await this.settleGalleryHeight(true)
      },

      destroy() {
        if (onProductChanged) {
          window.removeEventListener('product-changed', onProductChanged)
          onProductChanged = null
        }

        if (resizeTimer) {
          clearTimeout(resizeTimer)
          resizeTimer = null
        }

        resizeObserver?.disconnect()
        resizeObserver = null

        if (this.swiper) {
          this.swiper.destroy(true, true)
          this.swiper = null
        }

        if (this.swiperThumbs) {
          this.swiperThumbs.destroy(true, true)
          this.swiperThumbs = null
        }
      },

      async renderGallery(product: { handle: string }) {
        const mediaWrapper = this._getMediaWrapper()
        if (!mediaWrapper) {
          console.error('mediaWrapper not found')
          return
        }

        // Prevent the media column from jumping up when the new gallery is shorter.
        const lockTarget = this._getLockTarget() ?? mediaWrapper
        lockingHeight = true
        lockTarget.style.height = ''
        const reservedHeight = lockTarget.offsetHeight
        if (reservedHeight > 0) {
          lockTarget.style.height = `${reservedHeight}px`
        }


        const finish = () => {
          lockTarget.style.height = ''
          const natural = lockTarget.offsetHeight
          const next = Math.max(reservedHeight, natural)
          lockTarget.style.height = next > 0 ? `${next}px` : ''

          requestAnimationFrame(() => {
            lockingHeight = false
          })
        }

        try {
          const res = await fetch(`/products/${product.handle}?view=bundle`)

          if (!res.ok) {
            throw new Error(`Failed to fetch gallery: ${res.status}`)
          }

          const html = await res.text()
          const doc = new DOMParser().parseFromString(html, 'text/html')

          const newMediaInner = doc.querySelector('[data-media-gallery-bundle]')
          const oldMediaInner = mediaWrapper.querySelector(
            '[data-media-gallery-bundle]'
          )

          if (!newMediaInner || !oldMediaInner) {
            console.error('media gallery inner not found', {
              newMediaInner,
              oldMediaInner,
            })
            finish()
            return
          }

          // Height stays reserved across the swap, so nothing below moves.
          oldMediaInner.replaceWith(newMediaInner)

          await this.$nextTick()
          this._initSwiper()

          await this._waitForImages(mediaWrapper)
          finish()
        } catch (error) {
          console.error('error', error)
          finish()
        }
      },
    }
  })
}
