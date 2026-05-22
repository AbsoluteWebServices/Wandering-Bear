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
        loading: false,
        purchaseOption: 'autoship',
        sellingPlanId: null,
        bundleParentProducts: {},
        modal: null,
        
        get totalPrice() {
          let totalOriginalPrice = 0;
          let totalAutoshipPrice = 0;
          let totalOneTimePrice = 0;

          Object.values(this.assignedBundleProducts).forEach((product) => {
            console.log('product', product);
            totalOriginalPrice += product.originalPrice * product.quantity;
            totalAutoshipPrice += product.sellingPlanPrice * product.quantity;
            totalOneTimePrice += product.otpPrice * product.quantity;
          })

          return {
            original: this._formatPrice(totalOriginalPrice),
            autoship: this._formatPrice(totalAutoshipPrice),
            oneTime: this._formatPrice(totalOneTimePrice),
          }
        },

        get bundleSize() {
            //this._updateQueryString();
            return Object.values(this.selectedBundleProducts).reduce((acc, product) => {
              return acc + Number(product.quantity || 0)
            }, 0)
        },

        get addToCartText() {
            return this.bundleSize >= 1 ? 'Add to bag' : 'Add 1 flavor';
        },

        get currentSavingsAmount() {
            const bundleSize = (this.bundleSize <= 2) ? (this.bundleSize - 1) : 2;
            const originalPrice = this.selectedProduct?.variants[0].price;
            const newSellingPlanPrice = this.selectedProduct?.variants[bundleSize]?.selling_plan_price;
            const newOtpPrice = this.selectedProduct?.variants[bundleSize]?.price;
            const savingsAmountAutoship = this.bundleSize * (originalPrice - newSellingPlanPrice);
            const savingsAmountOneTime = this.bundleSize * (originalPrice - newOtpPrice);

            return this.purchaseOption === 'autoship' ? savingsAmountAutoship : savingsAmountOneTime;
        },

        get currentSavingsAmountFormatted() {
            return this._formatPrice(this.currentSavingsAmount);
        },

        get parentProduct() {
          const index = (this.bundleSize <= 2) ? (this.bundleSize - 1) : 2;
          return this.bundleParentProducts[index]
        },

        get assignedBundleProducts() {
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

            const assignedBundleProducts = Object.keys(this.selectedBundleProducts).map((productId) => {
                const product = this.bundleProducts[productId]
                const selectedProduct = this.selectedBundleProducts[productId]
            
                const variants = Object.values(product.variants)
                const variant = variants[variantIndex]
            
                return {
                  id: Number(variant.id),
                  quantity: selectedProduct.quantity,
                  otpPrice: Number(variant.price),
                  originalPrice: Number(product.variants[0].price),
                  sellingPlanPrice: Number(variant.selling_plan_price),
                  selling_plan: this.purchaseOption === 'autoship' ? Number(variant.selling_plan_id) : null,
                  properties: {
                    _bundle_product_id: productId,
                    _bundle_size: this.bundleSize,
                  },
                }
              })

            return assignedBundleProducts;
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

            const savings = this.purchaseOption === 'autoship' ? this.selectedProduct?.variants[index].selling_plan_savings : this.selectedProduct?.variants[0].price - this.selectedProduct?.variants[index].price

            savingsEl.textContent = savings > 0 ? this._formatPrice(savings) + ' off' : ' '
            priceEl.textContent = this._formatPrice(price)
          })
        },

        _addQueryParam(key, value) {
          const url = new URL(window.location)
          url.searchParams.set(key, value)
          window.history.pushState({}, "", url)
        },

        _updateQueryString() {
            let baseUrl = [
                location.protocol,
                "//",
                location.host,
                location.pathname,
            ].join("")
            let bundleParams = []
            let bundleIntervalParam = ""

            // Determine the active collection and build product parameters
            Object.entries(this.selectedBundleProducts).forEach(([key, value]) => {
                if (value.quantity > 0) {
                    bundleParams.push(`bundle=${key}_${value.quantity}`)
                }
            })
           
            // Construct the full query string
            let bundleFrequencyParam =
                this.purchaseOption === "autoship"
                    ? "bundle_interval=sub"
                    : "bundle_interval=otp"
            let queryString =
                bundleParams.join("&") +
                "&" +
                bundleFrequencyParam +
                "&" +
                bundleIntervalParam

            // Push the new URL to the history stack
            window.history.pushState(
                { path: baseUrl + "?" + queryString },
                "",
                baseUrl + "?" + queryString
            )
        },

        getOneTimePrice() {

            const price = this.assignedBundleProducts.reduce((acc: number, product: any) => {
                return acc + (Number(product.otpPrice) * Number(product.quantity))
            }, 0)
            
            return price;
        },

        getAutoshipPrice() {

            const price = this.assignedBundleProducts.reduce((acc: number, product: any) => {
                return acc + (Number(product.sellingPlanPrice) * Number(product.quantity))
            }, 0)

            return price;
        },

        _createGuid() {
            let d = new Date().getTime()
            let d2 =
                (performance && performance.now && performance.now() * 1000) ||
                0
            return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
                /[xy]/g,
                (c) => {
                    let r = Math.random() * 16
                    if (d > 0) {
                        r = (d + r) % 16 | 0
                        d = Math.floor(d / 16)
                    } else {
                        r = (d2 + r) % 16 | 0
                        d2 = Math.floor(d2 / 16)
                    }
                    return (c == "x" ? r : (r & 0x7) | 0x8).toString(16)
                }
            )
        },


        init() {
            this.bundleProducts = JSON.parse(this.$refs.productObject.textContent);
            this.bundleParentProducts = JSON.parse(this.$refs.bundleParentProducts.textContent);
            this.selectedProduct = this.bundleProducts[this.selectedProductId];

            let queryParams = new URLSearchParams(window.location.search)

            // Populate bundle if sent a link with query params
            queryParams.forEach((value, key) => {
              if (key === "bundle") {
                  let [variantId, quantity] = value.split("_")
                  let parsedQuantity = parseInt(quantity, 10)

                  this.selectedBundleProducts[variantId] = {
                    productId: variantId,
                    quantity: parsedQuantity,
                  }
                 
              } else if (key === "bundle_interval") {
                  this.purchaseOption = value === 'sub' ? 'autoship' : 'one_time';
              }
            })

        },

        onPurchaseOptionChange() {
            this._setProgressBarPrices();
            this._updateQueryString();
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

            let guid = this._createGuid();

            let bundleCart = {
              items: [],
            }

            this.assignedBundleProducts.forEach((item) => {
                let bundleItem = {
                  id: item.id,
                  quantity: item.quantity,
                  selling_plan: this.purchaseOption === 'autoship' ? item.selling_plan : null,
                  properties: {
                    _bundle_id: guid,
                  },
                }
                bundleCart.items.push(bundleItem);
            })

            let bundleParent = {
              id: this.parentProduct.variant_id,
              quantity: 1,
              selling_plan: this.purchaseOption === 'autoship' ? this.parentProduct.selling_plan_id : null,
              properties: {
                _bundle_id: guid,
                _bundle_parent: true,
              },
            }

            bundleCart.items.unshift(bundleParent);

          
            const res = await fetch('/cart/add.js', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
              },
              body: JSON.stringify(bundleCart),
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
