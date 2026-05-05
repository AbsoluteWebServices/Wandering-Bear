import { Alpine as AlpineType } from "alpinejs"
import Swiper from 'swiper';
import { Navigation } from 'swiper/modules';
import { CartAddEvent, CartErrorEvent } from '/assets/events'


export default (Alpine: AlpineType) => {
    Alpine.data("productFormBundle", ( selectedProductId: any) => ({
        selectedProductId: selectedProductId,
        selectedProduct: null,
        bundleProducts: {},
        selectedBundleProducts: {},
        assignedBundleProducts: [],
        loading: false,
        purchaseOption: 'autoship',
        savingsAmount: 5,
        sellingPlanId: null,

        get bundleSize() {
            return Object.values(this.selectedBundleProducts).reduce((acc, product) => {
              return acc + Number(product.quantity || 0)
            }, 0)
          },

        get currentSavingsAmount() {
            const bundleSize = (this.bundleSize <= 2) ? (this.bundleSize - 1) : 2;
            console.log('bundleSize', bundleSize);
            console.log('selectedProduct', this.selectedProduct);
            const savingsAmountAutoship = this.selectedProduct?.variants[0].price - this.selectedProduct?.variants[bundleSize]?.selling_plan_price;
            const savingsAmountOneTime = this.selectedProduct?.variants[0].price - this.selectedProduct?.variants[bundleSize]?.price;


            return this.purchaseOption === 'autoship' ? savingsAmountAutoship : savingsAmountOneTime;
        },

        // Helpers
        isInBundle(productId) {
            return this.selectedBundleProducts[productId] !== undefined && this.selectedBundleProducts[productId].quantity > 0
        },

        getBundleProductQuantity(productId) {
            return this.selectedBundleProducts[productId]?.quantity || 0;
        },

        get progressBarWidth() {
            switch (this.bundleSize) {
                case 0:
                    return 'width: 0%';
                case 1:
                    return 'width: 0%';
                case 2:
                    return 'width: 50%';
                case 3:
                    return 'width: 100%';
                default:
                    return 'width: 100%';
            }
        },

        _formatPrice(price) {
          const price_normalized = price / 100;
          return price_normalized.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
        },

        _setProgressBarPrices() {
          const tierEls = document.querySelectorAll('[data-tier]')

          tierEls.forEach((el, index) => {
            const priceEl = el.querySelector('[data-tier-price]')
            const savingsEl = el.querySelector('[data-tier-savings]')

            const price = this.purchaseOption === 'autoship' ? 
            this.selectedProduct?.variants[index].selling_plan_price : this.selectedProduct?.variants[index].price

            console.log('selectedProduct', this.selectedProduct);

            const savings = this.purchaseOption === 'autoship' ? this.selectedProduct?.variants[index].selling_plan_savings : this.selectedProduct?.variants[0].price - this.selectedProduct?.variants[index].price

            savingsEl.textContent = savings > 0 ? this._formatPrice(savings) + ' off' : ' '
            priceEl.textContent = this._formatPrice(price)
          })
        },

        _assignToBundle() {

            let variantIndex = 0;

            switch (this.bundleSize) {
                case 1:
                    variantIndex = 0;
                    break;
                case 2:
                    variantIndex = 1;
                    break;
                case 3:
                    variantIndex = 2;
                    break;
                default:
                    variantIndex = 2;
                    break;
            }

            this.assignedBundleProducts = Object.keys(this.selectedBundleProducts).map((productId) => {
                const product = this.bundleProducts[productId]
                const selectedProduct = this.selectedBundleProducts[productId]
            
                const variants = Object.values(product.variants)
                const variant = variants[variantIndex]
            
                return {
                  id: Number(variant.id),
                  quantity: selectedProduct.quantity,
                  otpPrice: Number(variant.price),
                  sellingPlanPrice: Number(variant.selling_plan_price),
                  selling_plan: this.purchaseOption === 'autoship' ? Number(variant.selling_plan_id) : null,
                  properties: {
                    _bundle_product_id: productId,
                    _bundle_size: this.bundleSize,
                  },
                }
              })

        },

        getOneTimePrice() {
            this._assignToBundle();

            const price = this.assignedBundleProducts.reduce((acc: number, product: any) => {
                return acc + (Number(product.otpPrice) * Number(product.quantity))
            }, 0)
            
            return price;
        },

        getAutoshipPrice() {
            this._assignToBundle();

            const price = this.assignedBundleProducts.reduce((acc: number, product: any) => {
                return acc + (Number(product.sellingPlanPrice) * Number(product.quantity))
            }, 0)

            return price;
        },

        init() {
            this.bundleProducts = JSON.parse(this.$refs.bundleProducts.textContent);
            this.selectedProduct = this.bundleProducts[this.selectedProductId];
            console.log('bundleProducts', this.bundleProducts);
            console.log('selectedProduct', this.selectedProduct);
        },

        onPurchaseOptionChange() {
            console.log('purchaseOption change', this.purchaseOption);
            this._setProgressBarPrices();
        },

        addToBundle(productId) {
            const id = String(productId)
          
            this.selectedBundleProducts = {
              ...this.selectedBundleProducts,
              [id]: {
                id,
                quantity: 1,
              },
            }
        },
        
        selectProduct(productId) {
            this.selectedProduct = this.bundleProducts[productId];
            window.dispatchEvent(new CustomEvent('product-changed', { detail: { product: this.selectedProduct }, bubbles: true, composed: true }));
        },

        async addToCart() {
            this.loading = true;
            this._assignToBundle()

            console.log('assignedBundleProducts', this.assignedBundleProducts);
          
            const res = await fetch('/cart/add.js', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
              },
              body: JSON.stringify({
                items: this.assignedBundleProducts,
              }),
            })
          
            if (!res.ok) {
              const errorText = await res.text()
          
              document.dispatchEvent(
                new CartErrorEvent('bundle-atc', 'ATC failed', errorText)
              )
          
              return
            }
          
            const cart = await fetch('/cart.js').then(r => r.json())
          
            document.dispatchEvent(
              new CartAddEvent(cart, 'bundle-atc', {
                source: 'bundle',
                itemCount: cart.item_count,
                autoOpen: true,
              })
            )

            this.selectedBundleProducts = {};

            this.loading = false;
          }


    }))
}
