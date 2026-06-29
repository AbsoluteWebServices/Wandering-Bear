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

            this.selectedVariant = this.productObject[this.selectedVariantId];
            this.updatePrices();

            window.addEventListener('variant-changed', (event) => {
                this.selectedVariantId = String(event.detail.variantId);
                this.selectedVariant = this.productObject[this.selectedVariantId];
                console.log('selected variant', this.selectedVariant);
                this.updatePrices();

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
            this.loading = true;

            let cartItem = {
              id: this.selectedVariantId,
              quantity: 1,
              selling_plan: this.purchaseOption === 'autoship' ? this.selectedVariant.selling_plan_id : null,
            }
          
            const res = await fetch('/cart/add.js', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
              },
              body: JSON.stringify(cartItem),
            })
          
            if (!res.ok) {
              const errorText = await res.text()
          
              document.dispatchEvent(
                new CartErrorEvent('product-atc', 'ATC failed', errorText)
              )
          
              return
            }
                    
            this.loading = false;
          }


    }))
}
