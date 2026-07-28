import { Alpine as AlpineType } from "alpinejs"
import Swiper from 'swiper';
import { Navigation } from 'swiper/modules';
import { CartAddEvent, CartErrorEvent } from '/assets/events'


export default (Alpine: AlpineType) => {
    Alpine.data("productForm", ( 
        productId: any, 
        selectedVariantId: any,
        sellingPlanId: any,
        landingPage: boolean = false
    ) => ({
        productObject: null,
        productId: productId,
        currentProductId: String(productId),
        product: null,
        selectedVariantId: selectedVariantId,
        selectedVariant: null,
        loading: false,
        purchaseOption: 'autoship',
        sellingPlanId: sellingPlanId,
        modal: null,
        basePrice: 0, // compare_at_price or price of first variant (for volume discount calculation)

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
              base: this._formatPrice(this.basePrice * quantity), // first variant's price for OTP discount display
            }
          },

        get currentSavingsAmount() {
            const variant = this.selectedVariant;
            if (!variant) return 0;

            const quantity = this._getCartQuantity(variant);

            if (this.purchaseOption === 'autoship') {
                if (variant.selling_plan_price == null) return 0;
                // Autoship: savings = basePrice - selling_plan_price (full discount: volume + subscription)
                return (this.basePrice - variant.selling_plan_price) * quantity;
            }

            // OTP: savings = basePrice - current variant price (volume discount only)
            if (this.basePrice > variant.price) {
                return (this.basePrice - variant.price) * quantity;
            }

            return 0;
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

        // productObject is keyed by variant id on a PDP, but by product id on the overview-2
        // LP, where each entry holds that product's own variant map. Return one variant list
        // per pricing group so savings are always compared within a single product.
        _variantGroups(): any[][] {
            const isVariant = (v: any) => v != null && typeof v === 'object' && 'price' in v;
            const values = Object.values(this.productObject ?? {}) as any[];

            if (values.length > 0 && values.every(isVariant)) {
                return [values];
            }

            return values
                .map((group) => Object.values(group ?? {}).filter(isVariant))
                .filter((group) => group.length > 0);
        },

        // `price` is per box, but `compare_at_price` is the bundle total — the 2-box variant
        // carries 2x the regular price. Dividing one by the other overstates the discount
        // (a 22% tier renders as 61%), so compare per-box against the single-box regular.
        _applySavings(variant: any, regularPerBox: number) {
            const price = variant.currentPrice;

            if (!(regularPerBox > 0) || !(price > 0) || price >= regularPerBox) {
                variant.currentSavings = 0;
                variant.currentSavingsPercentage = 0;
                variant.currentSavingsPercentageFormatted = '';
                variant.currentSavingsUnitAmount = 0;
                variant.currentSavingsUnitAmountFormatted = '';
                return;
            }

            variant.currentSavings = price / regularPerBox;
            variant.currentSavingsPercentage = Math.round(100 - variant.currentSavings * 100);
            variant.currentSavingsPercentageFormatted = 'Save ' + variant.currentSavingsPercentage + '%';

            // Flat-rate alternative to the percentage — the same per-unit saving expressed in
            // currency ("Save $10"). Designs show whole dollars, so cents are dropped when the
            // amount is exact and kept when it isn't, rather than rounding a real price away.
            const unitAmount = regularPerBox - price;
            variant.currentSavingsUnitAmount = unitAmount;
            variant.currentSavingsUnitAmountFormatted = 'Save ' + this._formatPrice(
                unitAmount,
                { withoutCents: unitAmount % 100 === 0 }
            );
        },

        variantById(variantId: any) {
            const key = String(variantId);
            const root = this.productObject ?? {};
            const isVariant = (v: any) => v != null && typeof v === 'object' && 'price' in v;

            if (isVariant(root[key])) {
                return root[key];
            }

            for (const group of Object.values(root) as any[]) {
                if (isVariant(group?.[key])) {
                    return group[key];
                }
            }

            return null;
        },


        _currentVariants(): any[] {
            const isVariant = (v: any) => v != null && typeof v === 'object' && 'price' in v;
            const group = this.productObject?.[String(this.currentProductId)];
            const nested = group ? (Object.values(group) as any[]).filter(isVariant) : [];

            return nested.length > 0 ? nested : (this._variantGroups()[0] ?? []);
        },

        variantPriceFormatted(variantId: any, suffix = '') {
            const formatted = this.variantById(variantId)?.currentPriceFormatted;
            return formatted ? formatted + suffix : '';
        },

        variantSavingsFormatted(variantId: any) {
            return this.variantById(variantId)?.currentSavingsPercentageFormatted ?? '';
        },

        variantSavingsPercentage(variantId: any) {
            return this.variantById(variantId)?.currentSavingsPercentage ?? 0;
        },

        // Flat-rate counterpart, selected by the variant picker's "Savings display" setting.
        variantSavingsAmountFormatted(variantId: any) {
            return this.variantById(variantId)?.currentSavingsUnitAmountFormatted ?? '';
        },

        _restoreFromDom() {
            const root = this.$root;
            if (!root) return;

            const flavor = root.querySelector('input[name="flavor"]:checked') as HTMLInputElement | null;
            const restoredProductId = flavor?.dataset.productId;

            if (restoredProductId && this.productObject?.[String(restoredProductId)]) {
                this.currentProductId = String(restoredProductId);
            }

            const purchase = root.querySelector('input[name="purchase_option"]:checked') as HTMLInputElement | null;
            if (purchase?.value) {
                this.purchaseOption = purchase.value;
                this.sellingPlanId = purchase.value === 'autoship'
                    ? this.selectedVariant?.selling_plan_id ?? null
                    : null;
            }

            this._syncSelectedVariant();
            this.updatePrices();
        },

        _restoreFromUrl() {
            const slug = new URL(window.location.href).searchParams.get('product');
            if (!slug) return;

            const radio = this.$root?.querySelector(
                `input[name="flavor"][value="${CSS.escape(slug)}"]`
            ) as HTMLInputElement | null;

            if (!radio) return;

            radio.checked = true;
            this._restoreFromDom();
        },

        _repriceGroup(variants: any[]) {
            const regularPerBox = variants[0]?.compare_at_price || variants[0]?.price || 0;

            variants.forEach((variant) => {
                variant.currentPrice = this._getVariantDisplayPrice(variant);
                variant.currentPriceFormatted = this._formatPrice(variant.currentPrice);
                this._applySavings(variant, regularPerBox);
            });
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

            const variants = this._currentVariants();
            const checkedId = checked.dataset.variantId;

            let variant = variants.find((v: any) => String(v.id) === String(checkedId)) ?? null;

            if (!variant) {
                const index = Number(checked.dataset.inputIndex);
                variant = Number.isInteger(index) ? variants[index] ?? null : null;
            }

            if (!variant) {
                return;
            }

            this.selectedVariantId = String(variant.id);
            this.selectedVariant = variant;
            this.sellingPlanId = this.purchaseOption === 'autoship'
                ? variant.selling_plan_id
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

            // Single-box regular price, used as the comparison base for volume discounts.
            // Read via _variantGroups because the LP nests variants under each product id,
            // where a direct Object.values() yields product groups and leaves basePrice at 0.
            const firstVariant = this._variantGroups()[0]?.[0];
            this.basePrice = firstVariant?.compare_at_price || firstVariant?.price || 0;

            this.product = this.productObject[String(this.productId)];

            if (landingPage) {
                // If the URL has a product query param, use it to fetch the product
                const url = new URL(window.location.href);
                const productResourceSlug = url.searchParams.get('product');

                if (productResourceSlug) {
                    this.fetchProduct(productResourceSlug);
                } else {
                    this.updateSelectedProductPrices(this.productId);
                }

            } else {

                Object.values(this.productObject).forEach((variant: any) => {
                    variant.currentPrice = variant.price;
                    variant.currentPriceFormatted = this._formatPrice(variant.price);
                    variant.currentSavingsPercentage = 0;
                    variant.currentSavingsPercentageFormatted = '';
                });
            }

            this.selectedVariantId = String(this.selectedVariantId);
            this.selectedVariant = this.variantById(this.selectedVariantId);
            this._syncSelectedVariant();
            this.updatePrices();

            this.$nextTick(() => {
                this._syncSelectedVariant();
                this.updatePrices();
            });

            window.addEventListener('variant-changed', () => {
                this._syncSelectedVariant();
                this.updatePrices();

                const mediaPosition = this.selectedVariant?.featured_media_position;
                if (mediaPosition) {
                    window.dispatchEvent(new CustomEvent('gallery-slide-to', {
                        detail: { position: mediaPosition }
                    }));
                }
            });


            window.addEventListener('pageshow', (event: PageTransitionEvent) => {
                if (event.persisted) {
                    this._restoreFromDom();
                } else {
                    this.$nextTick(() => this._restoreFromDom());
                }
            });

            window.addEventListener('popstate', () => {
                this._restoreFromUrl();
            });
        },

        goToBundle(url: string) {
            window.location.href = url;
        },

        onPurchaseOptionChange(option: string) {
            this.purchaseOption = option;
            this.sellingPlanId = this.purchaseOption === 'autoship' ? this.selectedVariant.selling_plan_id : null;
            this.updatePrices();
            
        },

        updatePrices() {
            this._variantGroups().forEach((variants) => this._repriceGroup(variants));
        },

        updateSelectedProductPrices(product: any) {
            const productId = product?.id ?? product;
            const group = this.productObject?.[String(productId)];
            if (!group) return;

            this._repriceGroup(Object.values(group) as any[]);
        },

        changeFlavor(productResourceSlug: string) {
            this.fetchProduct(productResourceSlug);
        },

        async fetchProduct(productResourceSlug: string) {
            const url = new URL(window.location.href);
            url.searchParams.set('product', productResourceSlug);
            window.history.replaceState({}, '', url.toString());
          
            const res = await fetch(`/products/${productResourceSlug}.json`);
            const data = await res.json();
            const product = data.product;
            const productId = String(product.id);

            console.log('currentProduct',product.title)

            this.currentProductId = productId;

            const firstVariantId = String(product.variants[0].id);
            const productObject = this.productObject[productId];
            this.selectedVariant = productObject?.[firstVariantId] ?? null;
            this.selectedVariantId = this.selectedVariant?.id ?? null;

            window.dispatchEvent(new CustomEvent('product-changed', {
                detail: { product: product }
            }));

            // Check the radio of the selected variant
            const radio = this.$root?.querySelector(`label[for="flavor-${productResourceSlug}"] input`);
            console.log('radio', radio);
            if (radio) {
                radio.checked = true;
            }
            this._syncSelectedVariant();
            this.updateSelectedProductPrices(product);
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
