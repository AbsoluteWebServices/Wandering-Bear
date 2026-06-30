import { Alpine as AlpineType } from "alpinejs"
import Swiper from 'swiper';
import { Navigation } from 'swiper/modules';

export default (Alpine: typeof Alpine) => {
    Alpine.data("mediaGalleryBundle", () => ({
        selectedProduct: null,
        swiper: null,
        swiperThumbs: null,

        _initSwiperThumbs() {

          const that = this

          if (this.swiperThumbs) {
            this.swiperThumbs.destroy(true, true);
            this.swiperThumbs = null;
          }

          this.swiperThumbs = new Swiper(this.$refs.swiperThumbs, {
            slidesPerView: 5,
            spaceBetween: 6,
            watchSlidesProgress: true,
            breakpoints: {
              1024: {
                slidesPerView: 5,
                spaceBetween: 10,
              },
            },
          });
        },

        _initSwiper() {
          if (this.swiper) {
            this.swiper.destroy(true, true);
            this.swiper = null;
          }

          this._initSwiperThumbs()

          const that = this

          this.swiper = new Swiper(this.$refs.swiper, {
            slidesPerView: 1.12,
            centeredSlides: true,
            loop: true,
            spaceBetween: 10,
            breakpoints: {
              1023: {
                slidesPerView: 1,
                centeredSlides: false,
                spaceBetween: 0,
              },
            },
            thumbs: {
              swiper: that.swiperThumbs,
            },
            
          });
        },

        init() {
          window.addEventListener('product-changed', (event: Event) => {
            this.selectedProduct = (event as CustomEvent).detail.product
            this.renderGallery(this.selectedProduct)
          })

          this._initSwiper()

        },

        async renderGallery(product) {
          
            const mediaWrapper = document.querySelector('[data-media-gallery-bundle-container]')
            mediaWrapper?.classList.add('opacity-0')

            if (!mediaWrapper) {
              console.error('mediaWrapper not found')
              return
            }
                    
            try {
              const res = await fetch(`/products/${product.handle}?view=bundle`)
          
              if (!res.ok) {
                throw new Error(`Failed to fetch gallery: ${res.status}`)
              }
          
              const html = await res.text()
              const doc = new DOMParser().parseFromString(html, 'text/html')
          
              const newMediaInner = doc.querySelector('[data-media-gallery-bundle]')
          
              if (!newMediaInner) {
                console.error('newMediaInner not found')
                return
              }

              const oldMediaInner = mediaWrapper.querySelector('[data-media-gallery-bundle]');

              if (!oldMediaInner) {
                console.error('oldMediaInner not found');
                return;
              }
              
              oldMediaInner.replaceWith(newMediaInner);

              this.$nextTick(() => {
                this._initSwiper();
              })

              mediaWrapper?.classList.remove('opacity-0')

            } catch (error) {
              console.error('error', error)
            }
          },

          
    }))
}
