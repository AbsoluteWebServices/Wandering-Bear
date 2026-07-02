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

export function initProductsSliders(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>('[data-products-slider]').forEach((track) => {
    if (initialized.has(track)) return
    if (track.dataset.layout !== 'slider') return

    const swiperEl = track.querySelector<HTMLElement>('.products-slider__swiper')
    if (!swiperEl) return

    const data = track.dataset as ProductsSliderDataset
    const showNavigation = data.showNavigation !== 'false'

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
      navigation: showNavigation
        ? {
            nextEl: track.querySelector<HTMLElement>('.products-slider__button-next'),
            prevEl: track.querySelector<HTMLElement>('.products-slider__button-prev'),
          }
        : undefined,
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
        init(swiper) {
          updateNavButtons(track, swiper)
        },
        resize(swiper) {
          updateNavButtons(track, swiper)
        },
        breakpoint(swiper) {
          updateNavButtons(track, swiper)
        },
      },
    })

    initialized.add(track)
  })
}

function updateNavButtons(track: HTMLElement, swiper: Swiper) {
  const buttons = track.querySelectorAll('.products-slider__button-next, .products-slider__button-prev')
  const slidesPerView = Number(swiper.slidesPerViewDynamic?.() ?? swiper.params.slidesPerView)
  const hideNav = swiper.slides.length <= slidesPerView

  buttons.forEach((button) => {
    button.classList.toggle('!opacity-0', hideNav)
    button.classList.toggle('!pointer-events-none', hideNav)
  })
}

export default function registerProductsSlider() {
  initProductsSliders()

  document.addEventListener('shopify:section:load', (event) => {
    if (event.target instanceof HTMLElement) {
      initProductsSliders(event.target)
    }
  })
}
