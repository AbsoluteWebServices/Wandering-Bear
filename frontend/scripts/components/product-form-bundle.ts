import { Alpine as AlpineType } from "alpinejs"
import Swiper from 'swiper';
import { Navigation } from 'swiper/modules';
import { CartAddEvent, CartErrorEvent } from '/assets/events'


export default (Alpine: AlpineType) => {
    Alpine.data("productFormBundle", ( 
      selectedProductId: any,
      bundleQty: any,
      flavorType: any,
      bundleType: any
    ) => ({
        selectedProductId: selectedProductId,
        selectedProduct: null,
        bundleType: bundleType,
        bundleQty: bundleQty,
        flavorType: flavorType,
        bundleProducts: {},
        selectedBundleProducts: {},
        loading: false,
        purchaseOption: 'autoship',
        sellingPlanId: null,
        bundleParentProducts: {},
        modal: null,
        qtyLimit: 6,

        get qtyLimitReached() {
          return this.bundleSize >= this.qtyLimit;
        },
        
        get totalPrice() {
          let totalOriginalPrice = 0;
          let totalAutoshipPrice = 0;
          let totalOneTimePrice = 0;

          Object.values(this.assignedBundleProducts).forEach((product) => {
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

        get bundleSlots() {
          const selected = this.assignedBundleProducts.flatMap(product =>
            Array.from({ length: Number(product.quantity || 0) }, () => product)
          );
        
          return Array.from({ length: this.qtyLimit }, (_, index) => selected[index] || null);
        },

        get bundleSize() {
            //this._updateQueryString();
            return Object.values(this.selectedBundleProducts).reduce((acc, product) => {
              return acc + Number(product.quantity || 0)
            }, 0)
        },

        get addToCartText() {
            if (this.bundleType === '32oz') {
              if (this.flavorType === 'mix') {
                return this.canAddToCart ? 'Add to bag' : `Add ${this.qtyLimit} flavors`;
              }

              return this.bundleSize >= 1 ? 'Add to bag' : 'Add 1 flavor';
            }

            return this.bundleSize >= 1 ? 'Add to bag' : 'Add 1 flavor';
        },

        get canAddToCart() {
          if (this.bundleType !== '32oz') {
            return this.bundleSize >= 1;
          }

          if (this.flavorType === 'single') {
            return this.bundleSize >= 1;
          }

          return this.bundleSize === this.qtyLimit;
        },

        get currentSavingsAmount() {
            return this.assignedBundleProducts.reduce((acc: number, product: any) => {
              const originalPrice = Number(product.originalPrice || 0);
              const quantity = Number(product.quantity || 0);
              const discountedPrice = this.purchaseOption === 'autoship'
                ? Number(product.sellingPlanPrice || 0)
                : Number(product.otpPrice || 0);

              return acc + Math.max(0, originalPrice - discountedPrice) * quantity;
            }, 0);
        },

        get currentSavingsAmountFormatted() {
            return this._formatPrice(this.currentSavingsAmount);
        },

        get parentProduct() {
          if (this.bundleType === '32oz') {
            return this.bundleParentProducts[this._mapTo32ozBundle()];
          } else {
            return this.bundleParentProducts[this._mapToBundle()];
          }
          // const index = (this.bundleSize <= 2) ? (this.bundleSize - 1) : 2;
          // return this.bundleParentProducts[index]
        },
        
        get assignedBundleProducts() {

          const variantIndex = this.bundleType === '32oz'
            ? this._mapTo32ozBundle()
            : this._mapToBundle();

            const assignedBundleProducts = Object.keys(this.selectedBundleProducts).map((productId) => {
                const product = this.bundleProducts[productId]
                const selectedProduct = this.selectedBundleProducts[productId]
            
                const variants = Object.values(product.variants)
                const variant = variants[variantIndex]
            
                return {
                  id: Number(variant.id),
                  quantity: selectedProduct.quantity,
                  flavorName: product.flavor_name ? product.flavor_name : '',
                  bundleName: product.bundle_name ? product.bundle_name : '',
                  collectionHandle: product.collection_handle ? product.collection_handle : '',
                  image: product.image ? product.image : '',
                  title: product.title,
                  otpPrice: Number(variant.price),
                  originalPrice: Number(product.variants[0].price),
                  sellingPlanPrice: Number(variant.selling_plan_price),
                  selling_plan: this.purchaseOption === 'autoship' ? Number(variant.selling_plan_id) : null,
                  properties: {
                    _bundle_product_id: productId,
                    _bundle_size: this.bundleSize,
                    _flavor_name: product.flavor_name ? product.flavor_name : '',
                    _bundle_name: product.bundle_name ? product.bundle_name : '',
                    _product_badge: product.badge ? product.badge : '',
                  },
                }
              })

            return assignedBundleProducts;
        },

        get disabled() {
          return this.flavorType !== 'single' && this.bundleSize >= this.qtyLimit;
        },

        _openCartDrawer() {
          const cartDrawer = document.querySelector('cart-drawer-component') as
              | (HTMLElement & { open?: () => void })
              | null;

          cartDrawer?.open?.();
        },

        // Helpers
        isInBundle(productId) {
            const id = String(productId)
            return this.selectedBundleProducts[id] !== undefined && this.selectedBundleProducts[id].quantity > 0
        },

        getBundleProductQuantity(productId) {
            return this.selectedBundleProducts[String(productId)]?.quantity || 0;
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

        _formatPrice(price, { withoutCents = false } = {}) {
          const price_normalized = price / 100;
          return price_normalized.toLocaleString('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: withoutCents ? 0 : undefined,
            maximumFractionDigits: withoutCents ? 0 : undefined,
          });
        },

        _setProgressBarPrices() {
          const tierEls = document.querySelectorAll('[data-tier]')

          tierEls.forEach((el, index) => {
            const priceEl = el.querySelector('[data-tier-price]')
            const savingsEl = el.querySelector('[data-tier-savings]')
            const multiUnitQuantity = this.selectedProduct?.variants[index].multi_unit_quantity;
            const discountType = this.selectedProduct?.variants[index].discount_type;
            const compareAtPrice = this.selectedProduct?.variants[0].price

            let autoshipPrice = 0;
            let otpPrice = 0;
            let autoshipSavings = 0;
            let otpSavings = 0;

            if (multiUnitQuantity) {
              autoshipPrice = this.selectedProduct?.variants[index].selling_plan_price / multiUnitQuantity;
              otpPrice = this.selectedProduct?.variants[index].price / multiUnitQuantity;
            } else {
              autoshipPrice = this.selectedProduct?.variants[index].selling_plan_price;
              otpPrice = this.selectedProduct?.variants[index].price;
            }

            const price = this.purchaseOption === 'autoship' ? autoshipPrice : otpPrice;

            if (discountType === 'Percentage') {
              autoshipSavings = 100 - (this.selectedProduct?.variants[index].selling_plan_price / compareAtPrice) * 100;
              otpSavings = 100 - (this.selectedProduct?.variants[index].price / compareAtPrice) * 100;
            } else {
              autoshipSavings = compareAtPrice - autoshipPrice;
              otpSavings = compareAtPrice - otpPrice;
            }

            const savings = this.purchaseOption === 'autoship' ? autoshipSavings : otpSavings;
            const savingsFormatted = discountType === 'Percentage' ? Math.round(savings) + '% off' : this._formatPrice(savings, { withoutCents: true }) + ' off';

            if (savingsEl) {
              savingsEl.textContent = savings > 0 ? savingsFormatted : ' ';
            }
            if (priceEl) {
              priceEl.textContent = this._formatPrice(price);
            }
          })
        },

        _clearBundle() {
          this.selectedBundleProducts = {};
        },

        _updateUrl(productHandle) {
          const url = new URL(window.location.href)
          url.pathname = `/products/${productHandle}`
          window.history.pushState({}, "", url.toString())
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

        _mapToBundle() {
          switch (this.bundleSize) {
            case 1:
              return 0;
            case 2:
              return 1;
            case 3:
            default:
              return 2;
          }
        },
        
        _mapTo32ozBundle() {
          if (this.bundleSize > 1 && this.bundleSize <= 3) {
            return 0;
          }
          return 1;
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

            if (this.bundleQty) {
              this.qtyLimit = this.bundleQty;
            }
            this._setProgressBarPrices();
        },

        onPurchaseOptionChange() {
            this._setProgressBarPrices();
            this._updateQueryString();
        },

        addToBundle(productId, type = null) {
            const id = String(productId)

            if (type === '32oz' && this.flavorType === 'single') {
              this.selectedBundleProducts = {};
              this.selectedBundleProducts = {
                [id]: {
                  id,
                  quantity: this.bundleQty,
                },
              }
              return;
            }
          
            this.selectedBundleProducts = {
              ...this.selectedBundleProducts,
              [id]: {
                id,
                quantity: 1,
              },
            }

        },

        selectProduct(productId, productHandle) {
            const scrollY = window.scrollY

            this._updateUrl(productHandle)
            this.selectedProduct = this.bundleProducts[productId]
            this._setProgressBarPrices()

            this.$nextTick(() => {
              const flavorScroll =
                document.querySelector(
                  '.flavor-container [data-overlayscrollbars-viewport]'
                ) || document.querySelector('.flavor-container')

              if (flavorScroll instanceof HTMLElement) {
                flavorScroll.scrollTop = 0
              }

              window.scrollTo(0, scrollY)

              window.dispatchEvent(
                new CustomEvent('product-changed', {
                  detail: { product: this.selectedProduct },
                  bubbles: true,
                  composed: true,
                })
              )

              requestAnimationFrame(() => {
                window.scrollTo(0, scrollY)
                requestAnimationFrame(() => window.scrollTo(0, scrollY))
              })
            })
        },

        changeFlavorType(type) {
            this.flavorType = type;
            this._clearBundle();
            this.selectedBundleProducts = {};
        },

        changeBundleQuantity(quantity) {
          this.bundleQty = Number(quantity);
          this.qtyLimit = this.bundleQty;
        
          if (this.flavorType === 'single') {
            this.selectedBundleProducts = {
              [this.selectedProductId]: {
                id: this.selectedProductId,
                quantity: this.bundleQty,
              },
            };
            return;
          }
        
          let overage = this.bundleSize - this.qtyLimit;
        
          if (overage <= 0) return;
        
          const entries = Object.entries(this.selectedBundleProducts).reverse();
        
          for (const [productId, product] of entries) {
            if (overage <= 0) break;
        
            const qty = Number(product.quantity || 0);
            const removeQty = Math.min(qty, overage);
            const newQty = qty - removeQty;
        
            if (newQty <= 0) {
              delete this.selectedBundleProducts[productId];
            } else {
              product.quantity = newQty;
            }
        
            overage -= removeQty;
          }
        
          this.selectedBundleProducts = { ...this.selectedBundleProducts };
        },

        async addToCart() {
            if (!this.canAddToCart || this.loading) {
              return;
            }

            this.loading = true;

            let guid = this._createGuid();

            let bundleCart = {
              items: [],
            }

            let collectionHandle = ''
            let bundleName = ''

            this.assignedBundleProducts.forEach((item) => {
                console.log('item',item);
                collectionHandle = item.collectionHandle;
                bundleName = item.bundleName;

                let bundleItem = {
                  id: item.id,
                  quantity: item.quantity,
                  selling_plan: this.purchaseOption === 'autoship' ? item.selling_plan : null,
                  properties: {
                    _bundle_id: guid,
                    _bundle_name: bundleName,
                    _flavor: item.flavorName,
                    _collection_handle: collectionHandle,
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
                _bundle_name: bundleName,
                _collection_handle: collectionHandle,
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
                source: 'bundle-atc',
                itemCount: cart.item_count,
                autoOpen: true,
              })
            )

            this.selectedBundleProducts = {};

            this.loading = false;
          }


    }))
}
