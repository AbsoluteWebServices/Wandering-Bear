import { CartUpdateEvent } from '../../../assets/events';

export default (Alpine: AlpineType) => {
  Alpine.store('cart', {
    state: '',
    cart: null,
  });

  Alpine.data('cart', () => ({
    showModifyBundle: false,
    bundleItems: [],
    tempBundle: [],
    bundleChanged: false,
    activeBundle: null,
    activeBundleCount: 0,
    bundleDetails: {},
    activeBundleDetails: {},
    progressBarWidth: 0,
    activeBundleName: null,
    tempBundleIndex: 0,

    get cart() {
      return Alpine.store('cart').cart;
    },

    get tempBundleCount() {
      return this.tempBundle.reduce((total, item) => {
        return total + Number(item.quantity || 0);
      }, 0);
    },

    set cart(value) {
      Alpine.store('cart').cart = value;
    },

    async init() {
      document.addEventListener('cart-open', async () => {
      
        await this.refreshCart();
        this.resetModifyBundle();
      });

      await this.refreshCart();

      this.bundleDetails = JSON.parse(document.getElementById('bundleDetails')?.textContent || '{}');
    },

    async refreshCart() {
      this.cart = await fetch('/cart.js', {
        headers: { Accept: 'application/json' },
      }).then(res => res.json());
    },

    async modifyBundle(collectionHandle, bundleName, bundleId) {
      this.activeBundleName = bundleName;
      await this.hydrateModifyBundle(collectionHandle, bundleName, bundleId);
      this.setupProgressBar(bundleName);

      this.activeBundle = bundleId;
      this.activeBundleCount = this.bundleItems.length;
      this.showModifyBundle = true;
    },

    async _getFlavorCollection(collectionHandle) {
      const res = await fetch(
        `/collections/${collectionHandle}/products.json?limit=250`
      );

      if (!res.ok) {
        console.error('Failed to fetch collection');
        return [];
      }

      const data = await res.json();
      return data.products || [];
    },

    _formatMoney(price) {
      console.log('price', price);
      return price.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
    },

    async changeBundleFrequency(event, sellingPlanId, bundleId) {
      this.closeDropdown(event);

      const frequencyEl = event.target
        .closest('[data-selector-container]')
        .querySelector('[data-frequency]');
    
      const isOneTime = event.target.id === 'one-time-purchase';
      const newSellingPlanId = isOneTime ? null : Number(sellingPlanId);
    
      frequencyEl.textContent = isOneTime
        ? 'One Time Purchase'
        : event.target.dataset.sellingPlanName;
    
      const bundleItems = this.cart.items.filter(item =>
        String(item.properties?._bundle_id) === String(bundleId)
      );
    
      for (const item of bundleItems) {
        const res = await fetch('/cart/change.js', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            id: item.key,
            quantity: item.quantity,
            selling_plan: newSellingPlanId,
          }),
        });
    
        if (!res.ok) {
          console.error(await res.text());
          return;
        }
      }

    
      await this.refreshCart();
    
      document.dispatchEvent(
        new CartUpdateEvent(this.cart, 'cart', {
          itemCount: this.cart.item_count,
          source: 'cart',
        })
      );
    },

    async changeBundleFrequency(event, sellingPlanId, bundleId) {
      const option = event.currentTarget;
      const selector = option.closest('[data-selector-container]');
      const frequencyLabel = selector?.querySelector(
        '[data-frequency-label]'
      );
    
      const newSellingPlanId = sellingPlanId
        ? Number(sellingPlanId)
        : null;
    
      if (frequencyLabel) {
        frequencyLabel.textContent =
          option.dataset.sellingPlanName || 'One Time Purchase';
      }
    
      const bundleItems = this.cart.items.filter(item =>
        String(item.properties?._bundle_id) === String(bundleId)
      );
    
      for (const item of bundleItems) {
        const response = await fetch('/cart/change.js', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            id: item.key,
            quantity: item.quantity,
            selling_plan: newSellingPlanId,
          }),
        });
    
        if (!response.ok) {
          console.error(await response.text());
          await this.refreshCart();
          return;
        }
      }
    
      await this.refreshCart();
    
      document.dispatchEvent(
        new CartUpdateEvent(this.cart, 'cart', {
          itemCount: this.cart.item_count,
          source: 'cart',
        })
      );
    },

    async removeBundle(bundleId) {
      const updates = {};

      this.cart.items
        .filter(item => String(item.properties?._bundle_id) === String(bundleId))
        .forEach(item => {
          updates[item.key] = 0;
        });

      const res = await fetch('/cart/update.js', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ updates }),
      });

      if (!res.ok) return;

      this.cart = await res.json();

      document.dispatchEvent(
        new CartUpdateEvent(this.cart, 'cart', {
          itemCount: this.cart.item_count,
          source: 'cart',
        })
      );

      this.resetModifyBundle();
      this.state = '';
    },

    changeState(state) {
      this.state = state;
    },

    getIndexFromCount(count) {
      if (count <= 0) return 0;
      return count < 3 ? count - 1 : 2;
    },

    hasSellingPlan(bundleId) {
      if (document.querySelector(`[data-bundle-id="${bundleId}"]`).checked) {
        return true;
      }
      return false;
    },

    async hydrateModifyBundle(collectionHandle, bundleName, bundleId) {
      const flavorCollection = await this._getFlavorCollection(collectionHandle);      

      await this.refreshCart();

      const cart = await fetch('/cart.js', {
        headers: { Accept: 'application/json' },
      }).then(res => res.json());

      if (!cart || !cart.items || cart.items.length === 0) return;

      this.bundleItems = (cart?.items ?? [])
      .filter(item =>
        String(item.properties?._bundle_id) === String(bundleId)
      )
      .filter(item =>
        String(item.properties?._bundle_parent) !== 'true'
      )
      .map(item => ({ ...item }));


      const bundleCount = this.getIndexFromCount(this.bundleItems.length);


      this.tempBundle = flavorCollection.map(product => {

        const cartItem = this.bundleItems.find(item =>
          Number(item.product_id) === Number(product.id)
        );

        const price = product.variants[bundleCount].price;
        const flavorName = cartItem?.properties?._flavor ?? product.title.split(' - ')[1];

        return {
          id: product.id,
          variantId: product.variants?.[0]?.id,
          key: cartItem?.key ?? null,
          title: product.title,
          price: price,
          image: product.images?.[0]?.src ?? '',
          quantity: cartItem?.quantity ?? 0,
          bundleId,
          collectionHandle: collectionHandle,
          flavorName: flavorName,
          variants: product.variants,
          cartVariantId: cartItem?.variant_id,
        };
      });

      this.tempBundleIndex = this.getIndexFromCount(this.tempBundleCount);

      this.tempBundle = [...this.tempBundle];

      // change price based on index (its an object)
      this.tempBundle[this.tempBundleIndex].price = this.bundleDetails[this.activeBundleName].bundle_products[this.tempBundleIndex].price;

      this.bundleChanged = false;
    },

    setupProgressBar(bundleName) {
      const tempBundle = this.tempBundle;

      const itemsAdded = tempBundle.reduce((total, item) => {
        return total + Number(item.quantity || 0);
      }, 0);

      const parentProductCount =
      Object.keys(this.bundleDetails[bundleName]?.bundle_products ?? {}).length; 
      
      const progress = (itemsAdded / parentProductCount) * 100;
      this.progressBarWidth = `${progress}%`;

      this.activeBundleDetails = this.bundleDetails[bundleName];
    },

    backToCart() {
      this.showModifyBundle = false;
      this.state = '';
      document.querySelector('.modify-bundle').style.transform = 'translateX(100%)';
    },

    bundleDecrement(id) {
      const item = this.tempBundle.find(item => Number(item.id) === Number(id));
      if (!item) return;

      item.quantity = Math.max(0, item.quantity - 1);

      this.tempBundle = [...this.tempBundle];
      this.bundleChangesDetected();
      this.setupProgressBar(this.activeBundleName);
      this.recalculateItemPrices()
    },

    bundleIncrement(id) {
      const item = this.tempBundle.find(item => Number(item.id) === Number(id));
      if (!item) return;

      item.quantity += 1;

      this.tempBundle = [...this.tempBundle];
      this.bundleChangesDetected();
      this.setupProgressBar(this.activeBundleName);
      this.recalculateItemPrices()
    },

    recalculateItemPrices() {

      this.tempBundle.forEach(item => {
        const variantIndex = this.getIndexFromCount(this.tempBundleCount);
        const itemPrice = item.variants?.[variantIndex]?.selling_plan_price ?? item.variants?.[variantIndex]?.price;
        item.price = itemPrice;
      });
    },

    bundleChangesDetected() {
      this.bundleChanged = this.tempBundle.some(tempItem => {
        const originalItem = this.bundleItems.find(item =>
          Number(item.product_id) === Number(tempItem.id)
        );

        return (originalItem?.quantity ?? 0) !== tempItem.quantity;
      });
    },

    resetModifyBundle() {
      this.bundleItems = [];
      this.tempBundle = [];
      this.bundleChanged = false;
      this.activeBundle = null;
      this.activeBundleCount = 0;
      this.showModifyBundle = false;
    },

    async updateBundle() {
      this.bundleChangesDetected();
      if (!this.bundleChanged) return;
    
      const updates = {};
      const additions = [];
    
      const bundleId = this.tempBundle[0]?.bundleId || this.activeBundle;
      const collectionHandle = this.tempBundle[0]?.collectionHandle;
    
      const bundleCount = this.tempBundle.reduce((total, item) => {
        return total + Number(item.quantity || 0);
      }, 0);
    
      if (bundleCount <= 0) return;
    
      const bundleVariantIndex = String(bundleCount < 3 ? bundleCount - 1 : 2);
    
      const parentProduct =
        this.bundleDetails[this.activeBundleName].bundle_products[bundleVariantIndex];
    
      const oldParentProduct = this.cart.items.find(item =>
        String(item.properties?._bundle_id) === String(bundleId) &&
        String(item.properties?._bundle_parent) === 'true'
      );
    
      const newParentVariantId = Number(parentProduct.variant_id);
      const oldParentVariantId = oldParentProduct
        ? Number(oldParentProduct.variant_id || oldParentProduct.id)
        : null;
    
      const parentChanged = oldParentVariantId !== newParentVariantId;
      const sellingPlanId = parentProduct.selling_plan_id || null;
    
      const addChild = (item, variantId) => {
        if (!item.quantity || !variantId) return;
    
        additions.push({
          id: Number(variantId),
          quantity: Number(item.quantity),
          selling_plan: sellingPlanId,
          properties: {
            _bundle_id: item.bundleId,
            _bundle_name: this.activeBundleName,
            _collection_handle: collectionHandle,
            _flavor: item.flavorName,
          },
        });
      };
    
      const addParent = () => {
        additions.push({
          id: newParentVariantId,
          quantity: 1,
          selling_plan: sellingPlanId,
          properties: {
            _bundle_id: bundleId,
            _bundle_parent: 'true',
            _bundle_name: this.activeBundleName,
            _collection_handle: collectionHandle,
          },
        });
      };
    
      this.tempBundle.forEach(item => {
        const newChildVariantId = item.variants?.[bundleVariantIndex]?.id || item.variantId;
    
        if (item.key) {
          if (parentChanged) {
            updates[item.key] = 0;
            addChild(item, newChildVariantId);
          } else {
            updates[item.key] = Number(item.quantity);
          }
    
          return;
        }
    
        addChild(item, newChildVariantId);
      });
    
      if (oldParentProduct && parentChanged) {
        updates[oldParentProduct.key] = 0;
      }
    
      if (!oldParentProduct || parentChanged) {
        addParent();
      }
    
      if (Object.keys(updates).length) {
        const updateRes = await fetch('/cart/update.js', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({ updates }),
        });
    
        if (!updateRes.ok) {
          console.error(await updateRes.text());
          return;
        }
      }
    
      if (additions.length) {
        const addRes = await fetch('/cart/add.js', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({ items: additions }),
        });
    
        if (!addRes.ok) {
          console.error(await addRes.text());
          return;
        }
      }
    
      await this.refreshCart();
    
      document.dispatchEvent(
        new CartUpdateEvent(this.cart, 'cart', {
          itemCount: this.cart.item_count,
          source: 'cart',
        })
      );
    
      this.resetModifyBundle();
      this.bundleChanged = false;
    },
  }));
};