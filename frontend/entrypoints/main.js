import 'vite/modulepreload-polyfill'

import 'swiper/bundle';
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/pagination';
import 'swiper/css/scrollbar';

import '../styles/typography.css';
import '../styles/colors.css';
import '../styles/components.css';
import '../styles/multi-collection-slider.css';
import '../styles/divider.css';
import '../styles/footer.css';
import '../styles/header.css';
import '../styles/media-gallery-bundle.css';
import '../styles/main-product.css';



export {}

let loaded = false

const init = async () => {
    if (loaded) return
    loaded = true
    const { default: Alpine } = await import("alpinejs")
    const { default: morph } = await import("@alpinejs/morph")

    const { default: SwiperSlider } = await import("~/scripts/components/swiperSlider")
    const { default: VideoPlayer } = await import("~/scripts/components/videoPlayer")
    const { default: Header } = await import("~/scripts/components/header")
    const { default: Tooltip } = await import("~/scripts/components/tooltip")
    const { default: ProductFormBundle } = await import("~/scripts/components/product-form-bundle")
    const { default: MediaGalleryBundle } = await import("~/scripts/components/media-gallery-bundle")
    const { default: Diagram } = await import("~/scripts/components/diagram")
    const { default: Accordion } = await import("~/scripts/components/accordion")
    const { default: Footer } = await import("~/scripts/components/footer")

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
    
    Alpine.start()
    window.Alpine = Alpine
}

document.addEventListener("mousedown", init, { once: true })
document.addEventListener("mousemove", init, { once: true })
document.addEventListener("scroll", init, { once: true })
document.addEventListener("touchstart", init, { once: true })
document.addEventListener("keydown", init, { once: true })

