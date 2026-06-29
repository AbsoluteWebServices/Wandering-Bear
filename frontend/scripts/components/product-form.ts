import { Alpine as AlpineType } from "alpinejs"
import Swiper from 'swiper';
import { Navigation } from 'swiper/modules';
import { CartAddEvent, CartErrorEvent } from '/assets/events'


export default (Alpine: AlpineType) => {
    Alpine.data("productForm", ( 
        productId: any, 
        selectedVariantId: any,
        sellingPlanId: any
    ) => ({
        productObject: null,
        productId: productId,
        product: null,
        selectedVariantId: selectedVariantId,
        selectedVariant: null,
        loading: false,
        purchaseOption: 'autoship',
        sellingPlanId: sellingPlanId,
        modal: null,

        get addToCartText() {
            return this.selectedVariant.available ? 'Add to Cart' : 'Sold Out';
        },

        get totalPrice() {
            let totalOriginalPrice = 0;
            let totalAutoshipPrice = 0;
            let totalOneTimePrice = 0;

            totalOriginalPrice += this.selectedVariant.price;
            totalAutoshipPrice += this.selectedVariant.selling_plan_price;
            totalOneTimePrice += this.selectedVariant.price;

            return {
              original: this._formatPrice(totalOriginalPrice),
              autoship: this._formatPrice(totalAutoshipPrice),
              oneTime: this._formatPrice(totalOneTimePrice),
            }
          },

        get currentSavingsAmount() {
            const savingsAmountAutoship = this.selectedVariant.price - this.selectedVariant.selling_plan_price;
            const savingsAmountOneTime = this.selectedVariant.price - this.selectedVariant.price;

            return savingsAmountAutoship;
        },

        get currentSavingsAmountFormatted() {
            return this._formatPrice(this.currentSavingsAmount);
        },

        _formatPrice(price) {
          const price_normalized = price / 100;
          return price_normalized.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
        },

        _getCartQuantity(variant: any) {
            if (variant?.quantified && variant?.quantified_units > 0) {
                return variant.quantified_units;
            }

            return 1;
        },

        _getCartSectionIds() {
            const sectionIds = new Set<string>();

            document.querySelectorAll('cart-items-component').forEach((item) => {
                if (item instanceof HTMLElement && item.dataset.sectionId) {
                    sectionIds.add(item.dataset.sectionId);
                }
            });

            return Array.from(sectionIds);
        },

        _openCartDrawer() {
            const cartDrawer = document.querySelector('cart-drawer-component') as
                | (HTMLElement & { open?: () => void })
                | null;

            cartDrawer?.open?.();
        },

        _syncSelectedVariant() {
            const picker = this.$root?.querySelector('variant-picker');
            const checked = picker?.querySelector('fieldset input:checked');

            if (!(checked instanceof HTMLInputElement)) {
                return;
            }

            const variantId = checked.dataset.variantId;

            if (!variantId || !this.productObject?.[variantId]) {
                return;
            }

            this.selectedVariantId = String(variantId);
            this.selectedVariant = this.productObject[this.selectedVariantId];
            this.sellingPlanId = this.purchaseOption === 'autoship'
                ? this.selectedVariant.selling_plan_id
                : null;
        },

        getOneTimePrice() {

            const price = this.selectedVariant.price;

            return price;
        },

        getAutoshipPrice() {
            const price = this.selectedVariant.selling_plan_price;
            return price;
        },

        init() {
            this.productObject = JSON.parse(this.$refs.productObject.textContent);

            Object.values(this.productObject).forEach((variant: any) => {
                variant.currentPrice = variant.price;
                variant.currentPriceFormatted = this._formatPrice(variant.price);
                variant.currentSavingsPercentage = 0;
                variant.currentSavingsPercentageFormatted = '';
            });

            this.selectedVariantId = String(this.selectedVariantId);
            this.selectedVariant = this.productObject[this.selectedVariantId];
            this._syncSelectedVariant();
            this.updatePrices();

            this.$nextTick(() => {
                this._syncSelectedVariant();
                this.updatePrices();
            });

            window.addEventListener('variant-changed', () => {
                this._syncSelectedVariant();
                this.updatePrices();
            });

            window.addEventListener('pageshow', (event: PageTransitionEvent) => {
                if (event.persisted) {
                    this._syncSelectedVariant();
                    this.updatePrices();
                }
            });
        },

        onPurchaseOptionChange(option: string) {
            this.purchaseOption = option;
            this.sellingPlanId = this.purchaseOption === 'autoship' ? this.selectedVariant.selling_plan_id : null;
            this.updatePrices();
            
        },

        updatePrices() {
            Object.values(this.productObject).forEach((variant: any) => {
                variant.currentPrice = this.purchaseOption === 'autoship' ? variant.selling_plan_price : variant.price;
                console.log('selling plan price', variant.selling_plan_price);
                console.log('price', variant.price);

                variant.currentPriceFormatted = this._formatPrice(variant.currentPrice);
                console.log('current price formatted', variant.currentPriceFormatted);
                variant.currentSavings = variant.currentPrice/variant.compare_at_price;
                variant.currentSavingsPercentage = Math.round(100 - variant.currentSavings * 100);
                variant.currentSavingsPercentageFormatted = 'Save ' + Math.round(variant.currentSavingsPercentage) + '%';
            });
        },

        async addToCart() {
            this._syncSelectedVariant();
            this.loading = true;

            const quantity = this._getCartQuantity(this.selectedVariant);
            const sectionIds = this._getCartSectionIds();

            const cartItem: Record<string, unknown> = {
              id: this.selectedVariant.id,
              quantity,
              selling_plan: this.purchaseOption === 'autoship' ? this.selectedVariant.selling_plan_id : null,
            };

            if (sectionIds.length > 0) {
              cartItem.sections = sectionIds.join(',');
              cartItem.sections_url = window.location.pathname + window.location.search;
            }

            try {
              const res = await fetch('/cart/add.js', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Accept': 'application/json',
                },
                body: JSON.stringify(cartItem),
              })
            
              const addResponse = await res.json();

              if (!res.ok || addResponse.status) {
                const errorText = addResponse.description || addResponse.message || 'ATC failed';

                document.dispatchEvent(
                  new CartErrorEvent('product-atc', 'ATC failed', errorText)
                )

                return
              }

              const cart = await fetch('/cart.js').then((r) => r.json())

              document.dispatchEvent(
                new CartAddEvent(cart, 'product-atc', {
                  source: 'product-atc',
                  itemCount: cart.item_count,
                  variantId: String(this.selectedVariant.id),
                  sections: addResponse.sections,
                })
              )

              this._openCartDrawer();
            } finally {
              this.loading = false;
            }
          }
    }))
}
