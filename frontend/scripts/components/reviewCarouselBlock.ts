import { Alpine as AlpineType } from 'alpinejs'
import Swiper from 'swiper'
import { Navigation, Pagination } from 'swiper/modules'

export default (Alpine: AlpineType) => {
  Alpine.data('reviewCarouselBlock', () => ({
    swiper: null,
    activeIndex: 0,


    init() {

        this.initSwiper();
    },

    initSwiper() {
        const el = this.$el;
        const swiperEl = el.querySelector('.swiper');

        this.swiper = new Swiper(swiperEl, {
            modules: [Navigation, Pagination],
            slidesPerView: 1,
            spaceBetween: 10,
            centeredSlides: true,

            pagination: {
                el: el.querySelector('.swiper-pagination'),
                clickable: true,
            },
            navigation: {
                nextEl: el.querySelector('.review-carousel__next'),
                prevEl: el.querySelector('.review-carousel__prev'),
            },
        });

        this.swiper.on('slideChange', () => {
            this.activeIndex = this.swiper.activeIndex;
            console.log('activeIndex', this.activeIndex);
        });
        
        console.log('swiper', this.swiper);
    },

  }))
}
