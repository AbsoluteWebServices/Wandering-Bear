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

      const perViewMobile = parseFloat(data.slidesMobile || '1')
      const perViewTablet = parseFloat(data.slidesTablet || '2')

      // Advance a whole page at a time. Cards overlap in a cycle of three — 1st flush, 2nd and
      // 3rd bleeding left over their neighbour — so stepping one slide at a time lands the
      // carousel mid-cycle: the new leftmost card still carries its bleed and hangs past the
      // track edge with nothing to overlap. Paging by slidesPerView keeps cycle and frame aligned.
      new Swiper(swiperEl, {
        modules: [Navigation, Pagination],
        slidesPerView: perViewMobile,
        slidesPerGroup: perViewMobile,
        spaceBetween: parseInt(data.spaceMobile || '12', 10),
        loop: canLoop,
        watchOverflow: true,
        // Marks the on-screen slides so the card overlap can key off what is actually visible
        // rather than the DOM index — see the bleed rules in aw-review-carousel.liquid.
        watchSlidesProgress: true,
        // With fewer reviews than slidesPerView the track kept them left-aligned and left a hole
        // on the right; centre them instead so a short list still reads as balanced.
        centerInsufficientSlides: true,
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
            slidesPerView: perViewTablet,
            slidesPerGroup: perViewTablet,
            spaceBetween: parseInt(data.spaceDesktop || '16', 10),
          },
          1024: {
            slidesPerView: perViewDesktop,
            slidesPerGroup: perViewDesktop,
            spaceBetween: parseInt(data.spaceDesktop || '16', 10),
          },
        },
      })

      initialized.add(root)
    },
  }))
}
