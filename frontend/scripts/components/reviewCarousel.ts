import Swiper from 'swiper'
import { Navigation, Pagination } from 'swiper/modules'

type ReviewCarouselDataset = {
  slidesMobile?: string
  slidesTablet?: string
  slidesDesktop?: string
  spaceMobile?: string
  spaceDesktop?: string
}

const initialized = new WeakSet<HTMLElement>()

export default (Alpine: any) => {
  Alpine.data('reviewCarousel', () => ({
    init() {
      if (!(this.$el instanceof HTMLElement)) return
      if (initialized.has(this.$el)) return

      const root = this.$el as HTMLElement
      const swiperEl = root.querySelector<HTMLElement>('.review-carousel__swiper')
      if (!swiperEl) return

      const data = root.dataset as ReviewCarouselDataset

      // Loop needs duplicates to fill the track: Swiper silently misplaces slides when there
      // are fewer than 2× slidesPerView. Below that, run without loop instead.
      const perViewDesktop = parseFloat(data.slidesDesktop || '3')
      const slideCount = swiperEl.querySelectorAll('.swiper-slide').length
      const canLoop = slideCount >= perViewDesktop * 2

      new Swiper(swiperEl, {
        modules: [Navigation, Pagination],
        slidesPerView: parseFloat(data.slidesMobile || '1'),
        spaceBetween: parseInt(data.spaceMobile || '12', 10),
        loop: canLoop,
        watchOverflow: true,
        observer: true,
        observeParents: true,
        navigation: {
          nextEl: root.querySelector<HTMLElement>('.review-carousel__next'),
          prevEl: root.querySelector<HTMLElement>('.review-carousel__prev'),
        },
        pagination: {
          el: root.querySelector<HTMLElement>('.review-carousel__dots'),
          clickable: true,
        },
        breakpoints: {
          768: {
            slidesPerView: parseFloat(data.slidesTablet || '2'),
            spaceBetween: parseInt(data.spaceDesktop || '16', 10),
          },
          1024: {
            slidesPerView: perViewDesktop,
            spaceBetween: parseInt(data.spaceDesktop || '16', 10),
          },
        },
      })

      initialized.add(root)
    },
  }))
}
