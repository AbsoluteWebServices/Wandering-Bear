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