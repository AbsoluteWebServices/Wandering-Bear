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
            return this.selectedVariant?.available ? 'Add to bag' : 'Sold Out';
        },

        get canAddToCart() {
            return Boolean(this.selectedVariant?.available);
        },

        get totalPrice() {
            const variant = this.selectedVariant;
            const quantity = this._getCartQuantity(variant);
            const unitPrice = variant?.price ?? 0;
            const unitAutoshipPrice = variant?.selling_plan_price ?? unitPrice;

            return {
              original: this._formatPrice(unitPrice * quantity),
              autoship: this._formatPrice(unitAutoshipPrice * quantity),
              oneTime: this._formatPrice(unitPrice * quantity),
            }
          },

        get currentSavingsAmount() {
            const variant = this.selectedVariant;

            if (this.purchaseOption !== 'autoship' || variant?.selling_plan_price == null) {
                return 0;
            }

            const quantity = this._getCartQuantity(variant);
            return (variant.price - variant.selling_plan_price) * quantity;
        },

        get currentSavingsAmountFormatted() {
            return this._formatPrice(this.currentSavingsAmount);
        },

        _formatPrice(price, { withoutCents = false } = {}) {
          if (price == null || Number.isNaN(Number(price))) {
            return '';
          }

          const price_normalized = price / 100;
          return price_normalized.toLocaleString('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: withoutCents ? 0 : undefined,
            maximumFractionDigits: withoutCents ? 0 : undefined,
          });
        },

        _getVariantDisplayPrice(variant: any) {
            if (this.purchaseOption === 'autoship' && variant?.selling_plan_price != null) {
                return variant.selling_plan_price;
            }

            return variant?.price;
        },

        _getCartQuantity(variant: any) {
            if (!variant?.quantified) {
                return 1;
            }

            const units = Number(variant?.quantified_units);

            if (units > 0) {
                return units;
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
                variant.currentPrice = this._getVariantDisplayPrice(variant);
                variant.currentPriceFormatted = this._formatPrice(variant.currentPrice);

                if (variant.compare_at_price > 0) {
                    variant.currentSavings = variant.currentPrice / variant.compare_at_price;
                    variant.currentSavingsPercentage = Math.round(100 - variant.currentSavings * 100);
                    variant.currentSavingsPercentageFormatted = 'Save ' + Math.round(variant.currentSavingsPercentage) + '%';
                } else {
                    variant.currentSavingsPercentage = 0;
                    variant.currentSavingsPercentageFormatted = '';
                }
            });
        },

        async addToCart() {
            if (!this.canAddToCart || this.loading) {
                return;
            }

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
