import { Alpine as AlpineType } from "alpinejs"
import Swiper from 'swiper';
import { Navigation, Mousewheel } from 'swiper/modules';

export default (Alpine: AlpineType) => {
    Alpine.data("swiperSlider", (
        activeCollectionTitle: string, 
        activeCollectionAccentText: string, 
        activeCollectionHandle: string) => ({
        swiper: null,
        dropdownOpen: false,
        el: null,
        activeCollectionTitle: activeCollectionTitle,
        activeCollectionAccentText: activeCollectionAccentText,
        activeCollectionHandle: activeCollectionHandle,

        get maxSlidesPerView() {
            const w = window.innerWidth;
            if (w >= 1024) return 5.8;
            if (w >= 768) return 3.5;
            return 2.5;
        },

        init() {
            this.el = this.$el;
            this.initSwiper();
            this.preloadHoverImages();
        },

        preloadHoverImages() {
            const run = () => {
                const conn = (navigator as any).connection;
                if (conn && (conn.saveData || /(^|-)2g$/.test(conn.effectiveType || ''))) return;

                const imgs = this.el.querySelectorAll('.js-carousel-hover-image') as NodeListOf<HTMLImageElement>;
                const seen = new Set<string>();

                imgs.forEach((img) => {
                    const src = img.getAttribute('src') || '';
                    const srcset = img.getAttribute('srcset') || '';
                    const sizes = img.getAttribute('sizes') || '';
                    const key = srcset || src;
                    if (!key || seen.has(key)) return; // dedupe repeated/looped slides
                    seen.add(key);

                    const warm = new Image();
                    if (sizes) warm.sizes = sizes;
                    if (srcset) warm.srcset = srcset;
                    if (src) warm.src = src;
                });
            };

            const schedule = () =>
                'requestIdleCallback' in window
                    ? (window as any).requestIdleCallback(run, { timeout: 2000 })
                    : setTimeout(run, 200);

            if (document.readyState === 'complete') {
                schedule();
            } else {
                window.addEventListener('load', schedule, { once: true });
            }
        },


        initSwiper() {
            const slideCount = this.el.querySelectorAll('.swiper-slide').length;
            const maxPerView = 5.8;
            const canLoop = slideCount >= Math.ceil(maxPerView) * 2; // needs >= 12 slides

            this.swiper = new Swiper(this.el.querySelector('.swiper'), {
                modules: [Navigation, Mousewheel],
                slidesPerView: 2.5,
                spaceBetween: 12,
                loopAdditionalSlides: 2, // extra clones = smoother wrap with fractional slidesPerView
                navigation: {
                    nextEl: '.swiper-button-next',
                    prevEl: '.swiper-button-prev',
                },
                mousewheel: {
                    forceToAxis: true,       // Prevents diagonal scrolling bugs
                    releaseOnEdges: true,    // Allows normal page scroll at the ends
                    sensitivity: 1,          // Lower this if trackpad feels hypersensitive
                },
                centeredSlides: true,
                watchOverflow: true,
                loop: canLoop,
                speed: 800,
                breakpoints: {
                    768: {
                        slidesPerView: 3.5,
                        centeredSlides: false,
                    },
                    1024: {
                        slidesPerView: 5.8,
                        spaceBetween: 20,
                        centeredSlides: false,
                    },
                },
                on: {
                    init: () => this.updateSlideWidth(),
                    resize: () => this.updateSlideWidth(),
                  }
            });
            
            this.$nextTick(() => {
                this.swiper?.update();
                this.swiper?.navigation?.update();
            });
        },

        updateSlideWidth() {
            if (!this.swiper?.slides?.length) return;
          
            const slideWidth = this.swiper.slides[0].offsetWidth;
            this.el.style.setProperty('--slide-width', `${slideWidth}px`);
        },

        toggleDropdown() {
            this.dropdownOpen = !this.dropdownOpen;
        },

        changeCollection(title: string, accentText: string, collectionHandle: string) {

            this.dropdownOpen = false;

            const url = `/collections/${collectionHandle}?view=collection-carousel`;

            fetch(url)
                .then(response => response.text())
                .then(html => {
                    this.swiperDestroy();

                    const swiperWrapper = this.el.querySelector('.swiper-wrapper');
                    swiperWrapper.innerHTML = html;

                    this.initSwiper();
                    this.preloadHoverImages();

                    this.activeCollectionTitle = title;
                    this.activeCollectionAccentText = accentText;
                    this.activeCollectionHandle = collectionHandle;
                })
                .catch(error => {
                    console.error('Error fetching collection carousel:', error);
            });

        },

        checkNavButtons() {
            const buttons = this.el.querySelectorAll('.swiper-button-next, .swiper-button-prev');
            buttons.forEach(button => {
                if (this.swiper.slides.length < this.swiper.params.slidesPerView) {
                    button?.classList.add('!opacity-0');
                    button?.classList.add('!pointer-events-none');
                } else {
                    button?.classList.remove('!opacity-0');
                    button?.classList.remove('!pointer-events-none');
                }
            });
        },

        swiperDestroy() {
            this.swiper.destroy();
            this.swiper = null;
        },

    }))
}