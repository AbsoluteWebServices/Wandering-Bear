import Swiper from 'swiper'
import { Navigation } from 'swiper/modules'

type ProductsSliderDataset = {
  layout?: string
  slidesMobile?: string
  slidesTablet?: string
  slidesDesktop?: string
  spaceMobile?: string
  spaceTablet?: string
  spaceDesktop?: string
  offsetMobile?: string
  offsetDesktop?: string
  showNavigation?: string
}

const initialized = new WeakSet<HTMLElement>()

export default (Alpine: any) => {
  Alpine.data('productsSlider', () => ({
    init() {
      if (!(this.$el instanceof HTMLElement)) return
      if (initialized.has(this.$el)) return
      if (this.$el?.dataset?.layout !== 'slider') return

      const track = this.$el as HTMLElement
      const swiperEl = track.querySelector<HTMLElement>('.products-slider__swiper')
      if (!swiperEl) return

      const data = track.dataset as ProductsSliderDataset
      const showNavigation = data.showNavigation !== 'false'

      const nextEl = track?.querySelector<HTMLElement>('.products-slider__button-next')
      const prevEl = track?.querySelector<HTMLElement>('.products-slider__button-prev')
      const hasNavigation = showNavigation && nextEl && prevEl

      new Swiper(swiperEl, {
        modules: [Navigation],
        slidesPerView: parseFloat(data.slidesMobile || '1.5'),
        spaceBetween: parseInt(data.spaceMobile || '12', 10),
        slidesOffsetBefore: parseInt(data.offsetMobile || '16', 10),
        slidesOffsetAfter: parseInt(data.offsetMobile || '16', 10),
        watchOverflow: true,
        observer: true,
        observeParents: true,
        loop: false,
        navigation: {
          enabled: Boolean(hasNavigation),
          nextEl,
          prevEl,
        },
        breakpoints: {
          768: {
            slidesPerView: parseFloat(data.slidesTablet || '2.5'),
            spaceBetween: parseInt(data.spaceTablet || data.spaceDesktop || '16', 10),
            slidesOffsetBefore: parseInt(data.offsetDesktop || '0', 10),
            slidesOffsetAfter: parseInt(data.offsetDesktop || '0', 10),
          },
          1024: {
            slidesPerView: parseFloat(data.slidesDesktop || '4'),
            spaceBetween: parseInt(data.spaceDesktop || '16', 10),
            slidesOffsetBefore: parseInt(data.offsetDesktop || '0', 10),
            slidesOffsetAfter: parseInt(data.offsetDesktop || '0', 10),
          },
        },
        on: {
          init: (swiper) => this.updateNavButtons(track, swiper),
          resize: (swiper) => this.updateNavButtons(track, swiper),
          breakpoint: (swiper) => this.updateNavButtons(track, swiper),
        },
      })

      initialized.add(track)
    },

    updateNavButtons(track: HTMLElement, swiper: Swiper) {
      const buttons = track.querySelectorAll('.products-slider__button-next, .products-slider__button-prev')
      const slidesPerView = Number(swiper.slidesPerViewDynamic?.() ?? swiper.params.slidesPerView)
      const hideNav = swiper.slides.length <= slidesPerView

      buttons.forEach((button) => {
        button.classList.toggle('!opacity-0', hideNav)
        button.classList.toggle('!pointer-events-none', hideNav)
      })
    },
  }))
}
