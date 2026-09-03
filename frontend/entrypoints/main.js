import 'vite/modulepreload-polyfill'

import 'swiper/bundle';
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/pagination';
import 'swiper/css/scrollbar';
import 'overlayscrollbars/overlayscrollbars.css';

import '../styles/typography.css';
import '../styles/colors.css';
import '../styles/components.css';
import '../styles/account.css';
import '../styles/multi-collection-slider.css';
import '../styles/divider.css';
import '../styles/footer.css';
import '../styles/header.css';
import '../styles/media-gallery-bundle.css';
import '../styles/main-product.css';
import '../styles/products-slider.css';
import '../styles/multi-coll-carousel.css';
import '../styles/blog.css';
import '../styles/collection.css';
import '../styles/inveterate.css';
import '../styles/stay-ai.css';
import '../styles/gift-card.css';
import '../styles/landing-pages.css';
import '../styles/okendo.css';

export {}

const positionBadges = () => {
    document.querySelectorAll('[data-anchor-target]').forEach((badge) => {
      const anchor = document.querySelector(
        `[data-anchor="${badge.dataset.anchorTarget}"]`
      )
  
      if (!anchor || !badge.offsetParent) return
  
      const anchorRect = anchor.getBoundingClientRect()
      const parentRect = badge.offsetParent.getBoundingClientRect()
      const mobile = window.innerWidth < 1024
  
      const x = Number(
        mobile
          ? badge.dataset.anchorXMobile || badge.dataset.anchorX || 0
          : badge.dataset.anchorX || 0
      )
  
      const y = Number(
        mobile
          ? badge.dataset.anchorYMobile || badge.dataset.anchorY || 0
          : badge.dataset.anchorY || 0
      )
  
      badge.style.left = `${anchorRect.right - parentRect.left + x}px`
      // badge.style.top = `${anchorRect.bottom - parentRect.top + y}px`
      badge.style.opacity = '1'
    })
}
  
document.addEventListener('DOMContentLoaded', positionBadges)
window.addEventListener('load', positionBadges)
window.addEventListener('resize', positionBadges)

let loaded = false

const init = async () => {
    if (loaded) return
    loaded = true
    // Awaiting these one-by-one made each chunk wait for the previous download to
    // finish before its own request was even issued — 28 serial round trips. They
    // have no interdependencies, so they are fetched concurrently instead; the
    // registration order below is unchanged and still governs plugin order.
    const [
        { default: Alpine },
        { default: morph },
        { default: SwiperSlider },
        { default: VideoPlayer },
        { default: Header },
        { default: Tooltip },
        { default: ProductFormBundle },
        { default: MediaGalleryBundle },
        { default: Diagram },
        { default: Accordion },
        { default: Footer },
        { default: Modal },
        { default: MembershipLogin },
        { default: BackInStock },
        { default: EliteAtc },
        { default: CreditRedemption },
        { default: DiagramToggle },
        { default: ProductForm },
        { default: HowToMix },
        { default: WaysToEnjoy },
        { default: ProductValueProps },
        { default: ProductsSlider },
        { default: ReviewCarousel },
        { default: OverlayScrollbar },
        { default: Cart },
        { default: ReviewCarouselBlock },
        { default: NutritionFacts },
        { default: PrivacyRights },
    ] = await Promise.all([
        import("alpinejs"),
        import("@alpinejs/morph"),
        import("~/scripts/components/swiperSlider"),
        import("~/scripts/components/videoPlayer"),
        import("~/scripts/components/header"),
        import("~/scripts/components/tooltip"),
        import("~/scripts/components/product-form-bundle"),
        import("~/scripts/components/media-gallery-bundle"),
        import("~/scripts/components/diagram"),
        import("~/scripts/components/accordion"),
        import("~/scripts/components/footer"),
        import("~/scripts/components/modal"),
        import("~/scripts/components/membership-login"),
        import("~/scripts/components/back-in-stock"),
        import("~/scripts/components/elite-atc"),
        import("~/scripts/components/creditRedemption"),
        import("~/scripts/components/diagramToggle"),
        import("~/scripts/components/product-form"),
        import("~/scripts/components/how-to-mix"),
        import("~/scripts/components/ways-to-enjoy"),
        import("~/scripts/components/productValueProps"),
        import("~/scripts/components/productsSlider"),
        import("~/scripts/components/reviewCarousel"),
        import("~/scripts/components/overlayScrollbar"),
        import("~/scripts/components/cart"),
        import("~/scripts/components/reviewCarouselBlock"),
        import("~/scripts/components/nutrition-facts"),
        import("~/scripts/components/privacyRights"),
    ])

    Alpine.plugin(morph)
    Alpine.plugin(SwiperSlider)
    Alpine.plugin(VideoPlayer)
    Alpine.plugin(Header)
    Alpine.plugin(Tooltip)
    Alpine.plugin(ProductFormBundle)
    Alpine.plugin(MediaGalleryBundle)
    Alpine.plugin(Diagram)
    Alpine.plugin(Accordion)
    Alpine.plugin(Footer)
    Alpine.plugin(Modal)
    Alpine.plugin(MembershipLogin)
    Alpine.plugin(BackInStock)
    Alpine.plugin(EliteAtc)
    Alpine.plugin(CreditRedemption)
    Alpine.plugin(DiagramToggle)
    Alpine.plugin(ProductForm)
    Alpine.plugin(HowToMix)
    Alpine.plugin(WaysToEnjoy)
    Alpine.plugin(ProductValueProps)
    Alpine.plugin(ProductsSlider)
    Alpine.plugin(ReviewCarousel)
    Alpine.plugin(OverlayScrollbar)
    Alpine.plugin(Cart)
    Alpine.plugin(ReviewCarouselBlock)
    Alpine.plugin(NutritionFacts)
    Alpine.plugin(PrivacyRights)
    
    // Global cart store: `hasMembership` tracks whether the cart contains the membership
    // (Elite) product. Reactive in Alpine (`$store.cart.hasMembership`) and readable from
    // plain JS (`Alpine.store('cart').hasMembership`). Refreshed on every `cart:update`.
    Alpine.store('cart', {
        hasMembership: false,
        membershipProductId: (window.WB_MEMBERSHIP && window.WB_MEMBERSHIP.productId) || null,

        init() {
            this.refresh()
            document.addEventListener('cart:update', () => this.refresh())
        },

        async refresh() {
            try {
                const cart = await fetch('/cart.js', { headers: { Accept: 'application/json' } }).then((r) => r.json())
                this.hasMembership = this.detectMembership(cart)
            } catch {
                /* cart unreachable — keep the previous value */
            }
        },

        detectMembership(cart) {
            const items = Array.isArray(cart && cart.items) ? cart.items : []
            const pid = this.membershipProductId
            return items.some((item) =>
                (pid != null && Number(item.product_id) === Number(pid)) ||
                /membership/i.test(item.product_title || item.title || '')
            )
        },
    })

    Alpine.start()
    window.Alpine = Alpine

    document.addEventListener('click', (event) => {
        const trigger = event.target.closest('[href="#nutrition-facts"]')
        if (!trigger) return

        event.preventDefault()
        event.stopPropagation()

        window.dispatchEvent(
            new CustomEvent('modal-open', {
                detail: { modal: 'nutrition-facts' },
            })
        )
    }, true)
}

document.addEventListener("mousedown", init, { once: true })
document.addEventListener("mousemove", init, { once: true })
document.addEventListener("scroll", init, { once: true })
document.addEventListener("touchstart", init, { once: true })
document.addEventListener("keydown", init, { once: true })
document.addEventListener("DOMContentLoaded", init, { once: true })

