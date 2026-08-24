import { Alpine as AlpineType } from "alpinejs"
import Swiper from 'swiper';
import { Navigation } from 'swiper/modules';
import { CartAddEvent, CartErrorEvent } from '/assets/events'


export default (Alpine: AlpineType) => {
    Alpine.data("productFormBundle", ( 
      selectedProductId: any,
      bundleQty: any,
      flavorType: any,
      bundleType: any,
      landingPage: boolean = false
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
        _seq: 0,
        // Remembers the last flavor chosen while in single-flavor mode so
        // toggling flavor type (or quantity) doesn't reset to the default product.
        lastSingleFlavorId: null,

        get qtyLimitReached() {
          return this.bundleSize >= this.qtyLimit;
        },

        get hasEliteItem() {
          return Alpine.store('cart').hasMembership;
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
            return this._formatPrice(this.currentSavingsAmount, { withoutCents: true });
        },

        get parentProduct() {
          if (this.bundleType === '32oz') {
            return this.bundleParentProducts[this._mapTo32ozBundle()];
          } else {
            return this.bundleParentProducts[this._mapToBundle()];
          }
        },
        
        get assignedBundleProducts() {

          // 6 Carton + Single Flavor is fulfilled by a single pre-made 6-pack
          if (this._is6packSingle()) {
            return this._sixPackSingleLine();
          }

          const variantIndex = this.bundleType === '32oz'
            ? this._mapTo32ozBundle()
            : this._mapToBundle();

            // Preserve the order flavors were added in.
            const orderedProductIds = Object.keys(this.selectedBundleProducts).sort(
              (a, b) => (this.selectedBundleProducts[a]?._order ?? 0) - (this.selectedBundleProducts[b]?._order ?? 0)
            )

            const assignedBundleProducts = orderedProductIds.map((productId) => {
                const product = this.bundleProducts[productId]
                const selectedProduct = this.selectedBundleProducts[productId]

                const variants = Object.values(product.variants)
                const regularVariant = variants[variantIndex]

                const bundleUnit = this.bundleType === '32oz'
                  ? ((Number(this.bundleQty) === 6 ? variants[0]?.bundle_unit_6 : variants[0]?.bundle_unit) ?? variants[0]?.bundle_unit)
                  : null;
                const variant = bundleUnit ?? regularVariant;

                return {
                  id: Number(variant.id),
                  quantity: selectedProduct.quantity,
                  flavorName: product.flavor_name ? product.flavor_name : '',
                  bundleName: product.bundle_name ? product.bundle_name : '',
                  collectionHandle: product.collection_handle ? product.collection_handle : '',
                  image: product.image ? product.image : '',
                  title: product.title,
                  otpPrice: Number(variant.price),
                  originalPrice: Number(variant.compare_at_price ?? product.variants[0].price),
                  sellingPlanPrice: Number(variant.selling_plan_price),
                  selling_plan: this.purchaseOption === 'autoship' ? Number(variant.selling_plan_id) : null,
                 
                  properties: {
                    _bundle_product_id: productId,
                    _bundle_size: this.bundleSize,
                    _flavor_name: product.flavor_name ? product.flavor_name : '',
                    _bundle_name: product.bundle_name ? product.bundle_name : '',
                    _product_badge: product.badge ? product.badge : '',
                    _flavor_type: this.flavorType ? this.flavorType : '',
                    _bundle_type: this.bundleType ? this.bundleType : '',
                    _type: product.type ? product.type : '',
                    _typeColor: product.background_color ? product.background_color : '',
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
          const tierEls = document.querySelectorAll('[data-pdp] [data-tier]')

          tierEls.forEach((el, index) => {
            const priceEl = el.querySelector('[data-tier-price]')
            const savingsEl = el.querySelector('[data-tier-savings]')
            const selectedVariant = this.selectedProduct?.variants[index] || null;
            const multiUnitQuantity = selectedVariant?.multi_unit_quantity || null;
            const discountType = selectedVariant?.discount_type || null;
            const compareAtPrice = this.selectedProduct?.variants[0]?.price || null;

            let autoshipPrice = 0;
            let otpPrice = 0;
            let autoshipSavings = 0;
            let otpSavings = 0;

            if (multiUnitQuantity) {
              autoshipPrice = selectedVariant?.selling_plan_price / multiUnitQuantity;
              otpPrice = selectedVariant?.price / multiUnitQuantity;
            } else {
              autoshipPrice = selectedVariant?.selling_plan_price;
              otpPrice = selectedVariant?.price;
            }

            const price = this.purchaseOption === 'autoship' ? autoshipPrice : otpPrice;

            if (discountType === 'Percentage') {
              autoshipSavings = 100 - (selectedVariant?.selling_plan_price / compareAtPrice) * 100;
              otpSavings = 100 - (selectedVariant?.price / compareAtPrice) * 100;
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

        // The flavor id currently selected in single-flavor mode.
        _currentSingleFlavorId() {
          const keys = Object.keys(this.selectedBundleProducts);
          if (keys.length) return String(keys[0]);
          return this._resolveSingleFlavorId();
        },

        _sixPackVariant() {
          const product = this.bundleProducts[this._currentSingleFlavorId()];
          const variants = product ? Object.values(product.variants) : [];
          return variants[1] ?? null;
        },

        _is6packSingle() {
          if (this.bundleType !== '32oz') return false;
          if (this.flavorType !== 'single') return false;
          if (Number(this.bundleQty) !== 6) return false;

          const sixpack = this._sixPackVariant();
          return !!(sixpack && sixpack.id);
        },

        // Build the single cart line for the 6 Carton + Single Flavor case.
        _sixPackSingleLine() {
          const product = this.bundleProducts[this._currentSingleFlavorId()];
          const sixpack = this._sixPackVariant();
          if (!sixpack) return [];

          const originalPrice = Number(sixpack.compare_at_price ?? sixpack.price);
          const sellingPlanPrice = Number(sixpack.selling_plan_price ?? sixpack.price);

          return [{
            id: Number(sixpack.id),
            quantity: 1,
            flavorName: product.flavor_name ? product.flavor_name : '',
            bundleName: product.bundle_name ? product.bundle_name : '',
            collectionHandle: product.collection_handle ? product.collection_handle : '',
            image: product.image ? product.image : '',
            title: product.title,
            otpPrice: Number(sixpack.price),
            originalPrice,
            sellingPlanPrice,
            selling_plan: this.purchaseOption === 'autoship' && sixpack.selling_plan_id
              ? Number(sixpack.selling_plan_id)
              : null,
            // Plain standalone SKU — no bundle grouping properties.
            properties: {},
            _plainLine: true,
          }];
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
            console.log('bundleProducts', this.bundleProducts);
            this.bundleParentProducts = JSON.parse(this.$refs.bundleParentProducts.textContent);

            if (!this.bundleProducts[this.selectedProductId]) {
              const firstKey = Object.keys(this.bundleProducts)[0];
              if (firstKey) this.selectedProductId = firstKey;
            }

            this.selectedProduct = this.bundleProducts[this.selectedProductId];

            if (this.bundleQty) {
              this.qtyLimit = this.bundleQty;
            }


            this._restoreBundleFromUrl();


            this.$watch('selectedBundleProducts', () => this._persistBundleToUrl());
            this.$watch('purchaseOption', () => this._persistBundleToUrl());
            // 32oz mix/single
            this.$watch('flavorType', () => this._persistBundleToUrl());
            this.$watch('bundleQty', () => this._persistBundleToUrl());

            this._setProgressBarPrices();
        },

        /**
         * Serialize the current selection into the URL as `bundle=<id>_<qty>`
         * params (+ `bundle_interval`)
         */
        _persistBundleToUrl() {
            const url = new URL(window.location.href);
            url.searchParams.delete('bundle');

            let hasSelection = false;
            const orderedEntries = Object.entries(this.selectedBundleProducts).sort(
                ([, a]: [string, any], [, b]: [string, any]) => (a?._order ?? 0) - (b?._order ?? 0)
            );
            orderedEntries.forEach(([id, product]: [string, any]) => {
                const quantity = Number(product?.quantity || 0);
                if (quantity > 0) {
                    url.searchParams.append('bundle', `${id}_${quantity}`);
                    hasSelection = true;
                }
            });

            if (hasSelection) {
                url.searchParams.set('bundle_interval', this.purchaseOption === 'autoship' ? 'sub' : 'otp');
 
                if (this.bundleType === '32oz') {
                    if (this.flavorType) url.searchParams.set('bundle_flavor', this.flavorType);
                    else url.searchParams.delete('bundle_flavor');
                    url.searchParams.set('bundle_qty', String(this.bundleQty));
                }
            } else {
                url.searchParams.delete('bundle_interval');
                url.searchParams.delete('bundle_flavor');
                url.searchParams.delete('bundle_qty');
            }

            window.history.replaceState(window.history.state, '', url.toString());
        },

        _restoreBundleFromUrl() {
            const params = new URLSearchParams(window.location.search);

            const interval = params.get('bundle_interval');
            if (interval === 'sub') this.purchaseOption = 'autoship';
            else if (interval === 'otp') this.purchaseOption = 'one_time';

            const flavor = params.get('bundle_flavor');
            if (flavor === 'mix' || flavor === 'single') this.flavorType = flavor;

            const limit = Number(params.get('bundle_qty'));
            if (Number.isFinite(limit) && limit > 0) {
                this.bundleQty = limit;
                this.qtyLimit = limit;
            }

            const entries = params.getAll('bundle');
            if (entries.length === 0) return;

            const restored: Record<string, { id: string; quantity: number; _order: number }> = {};
            let total = 0;

            for (const raw of entries) {
                const [id, qtyRaw] = raw.split('_');
                const quantity = Number(qtyRaw);
                if (!id || !Number.isFinite(quantity) || quantity <= 0) continue;

                if (!this.bundleProducts[id]) continue;

                const remaining = this.qtyLimit - total;
                if (remaining <= 0) break;

                const clamped = Math.min(quantity, remaining);
                restored[id] = { id, quantity: clamped, _order: this._seq++ };
                total += clamped;
            }

            if (Object.keys(restored).length > 0) {
                this.selectedBundleProducts = restored;

                // Remember the restored single-flavor choice so toggling flavor
                // type later re-selects it instead of the default product.
                if (this.flavorType === 'single') {
                    this.lastSingleFlavorId = Object.keys(restored)[0];
                }
            }
        },

        onPurchaseOptionChange() {
            this._setProgressBarPrices();
        },

        incrementQty(selectedProductId) {
          if (this.bundleSize >= this.qtyLimit) {
            return;
          }
          this.selectedBundleProducts[selectedProductId].quantity++;
        },

        decrementQty(selectedProductId) {
          if (this.bundleSize == 0) {
            return;
          }
          this.selectedBundleProducts[selectedProductId].quantity--;
        },

        addToBundle(productId, type = null) {

            const id = String(productId)

            if (type === '32oz' && this.flavorType === 'single') {
              this.lastSingleFlavorId = id;
              this.selectedBundleProducts = {};
              this.selectedBundleProducts = {
                [id]: {
                  id,
                  quantity: this.bundleQty,
                  _order: this._seq++,
                },
              }
              return;
            }

            // Keep the existing `_order` if this flavor is already in the bundle
            // so re-clicking doesn't jump it to the end; only new entries get a
            // fresh stamp.
            const existingOrder = this.selectedBundleProducts[id]?._order;

            this.selectedBundleProducts = {
              ...this.selectedBundleProducts,
              [id]: {
                id,
                quantity: 1,
                _order: existingOrder ?? this._seq++,
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

        // Resolve which product the single-flavor selection should use: the last
        // one the shopper picked in single mode, otherwise the default product.
        _resolveSingleFlavorId() {
            const id = String(this.lastSingleFlavorId ?? this.selectedProductId);
            return this.bundleProducts[id] ? id : String(this.selectedProductId);
        },

        changeFlavorType(type) {
            this.flavorType = type;
            this._clearBundle();

            if (type === 'single') {
                const id = this._resolveSingleFlavorId();
                this.lastSingleFlavorId = id;
                this.selectedBundleProducts = {
                    [id]: {
                        id,
                        quantity: this.bundleQty,
                        _order: this._seq++,
                    },
                };
            } else {
                this.selectedBundleProducts = {};
            }
        },

        changeBundleQuantity(quantity) {
          this.bundleQty = Number(quantity);
          this.qtyLimit = this.bundleQty;
        
          if (this.flavorType === 'single') {
            const id = this._resolveSingleFlavorId();
            this.lastSingleFlavorId = id;
            this.selectedBundleProducts = {
              [id]: {
                id,
                quantity: this.bundleQty,
                _order: this._seq++,
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

            // 6 Carton + Single Flavor: add ONE plain 6-pack line. No bundle
            // parent wrapper, no _bundle_* grouping, no child lines.
            if (this._is6packSingle()) {
              const line = this.assignedBundleProducts[0];

              if (!line) {
                this.loading = false;
                return;
              }

              bundleCart.items.push({
                id: line.id,
                quantity: 1,
                selling_plan: this.purchaseOption === 'autoship' ? line.selling_plan : null,
              });

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
                this.loading = false;
                return
              }

              const cart = await fetch('/cart.js').then((response) => response.json())
              document.dispatchEvent(
                new CartAddEvent({}, 'bundle-atc', { resource: cart })
              )

              this.selectedBundleProducts = {};
              this.loading = false;
              return;
            }

            let collectionHandle = ''
            let bundleName = ''

            this.assignedBundleProducts.forEach((item) => {
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
                    _bundle_product_id: item.properties?._bundle_product_id,
                    _type: item.properties?._type,
                    _typeColor: item.properties?._typeColor,
                  },
                }

                if (this.bundleType === '32oz') {
                  bundleItem.properties._flavor_type = this.flavorType;
                  bundleItem.properties._bundle_type = this.bundleType;
                  bundleItem.properties._bundle_size = this.bundleSize;
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

            if (this.bundleType === '32oz') {
              bundleParent.properties._flavor_type = this.flavorType;
              bundleParent.properties._bundle_type = this.bundleType;
              bundleParent.properties._bundle_size = this.bundleSize;
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
          
            const cart = await fetch('/cart.js').then((response) => response.json())

            document.dispatchEvent(
              new CartAddEvent(
                {},
                'bundle-atc',
                {
                  resource: cart,
                }
              )
            )
                      
            this.selectedBundleProducts = {};

            this.loading = false;
          }


    }))
}
