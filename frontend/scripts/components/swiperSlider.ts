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

        init() {
            this.el = this.$el;
            this.initSwiper();
        },

        initSwiper() {
            const slideCount = this.el.querySelectorAll('.swiper-slide').length;
            
            this.swiper = new Swiper(this.el.querySelector('.swiper'), {
                modules: [Navigation, Mousewheel],
                slidesPerView: 2.5,
                spaceBetween: 12,
                navigation: {
                    nextEl: '.swiper-button-next',
                    prevEl: '.swiper-button-prev',
                },
                mousewheel: {
                    forceToAxis: true,       // Prevents diagonal scrolling bugs
                    releaseOnEdges: true,    // Allows normal page scroll at the ends
                    sensitivity: 1,          // Lower this if trackpad feels hypersensitive
                },
                slidesOffsetBefore: 12,
                slidesOffsetAfter: 12,
                centeredSlides: true,
                centerInsufficientSlides: true,
                centeredSlidesBounds: true,
                watchOverflow: true,
                loop: false,
                breakpoints: {
                    768: {
                        slidesPerView: 3.5,
                    },
                    1024: {
                        slidesPerView: 5.8,
                        spaceBetween: 20,
                        centeredSlides: slideCount < 6,
                        centerInsufficientSlides: slideCount < 6,
                        centeredSlidesBounds: slideCount < 6,
                    },
                },
                on: {
                    init: () => this.updateSlideWidth(),
                    resize: () => this.updateSlideWidth(),
                  }
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
                    const swiperWrapper = this.el.querySelector('.swiper-wrapper');
                    swiperWrapper.innerHTML = html;
                    this.swiperDestroy();
                    this.initSwiper();

                    this.activeCollectionTitle = title;
                    this.activeCollectionAccentText = accentText;
                    this.activeCollectionHandle = collectionHandle;

                    this.$nextTick(() => {
                        this.swiper.update();
                        this.checkNavButtons();
                        console.log('this swiper', this.swiper);
                    });

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