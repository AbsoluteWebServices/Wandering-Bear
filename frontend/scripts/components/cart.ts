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

    get state() {
      return Alpine.store('cart').state;
    },

    set state(value) {
      Alpine.store('cart').state = value;
    },

    get cart() {
      return Alpine.store('cart').cart;
    },

    set cart(value) {
      Alpine.store('cart').cart = value;
    },

    async init() {
      document.addEventListener('cart-open', async () => {
        console.log('cart open event received', this.state);
      
        await this.refreshCart();
        this.resetModifyBundle();
      });

      await this.refreshCart();

      this.bundleDetails = JSON.parse(document.getElementById('bundleDetails')?.textContent || '{}');
      console.log('bundleDetails', this.bundleDetails);
    },

    async refreshCart() {
      console.log('refreshing cart');
      this.cart = await fetch('/cart.js', {
        headers: { Accept: 'application/json' },
      }).then(res => res.json());
      console.log('cart refreshed', this.cart);
    },

    async modifyBundle(collectionHandle, bundleName, bundleId) {
      await this.hydrateModifyBundle(collectionHandle, bundleId);
      this.setupProgressBar(bundleName);

    
      this.activeBundle = bundleId;
      this.activeBundleCount = this.bundleItems.length;
      this.state = 'modifyBundle';
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

    async hydrateModifyBundle(collectionHandle, bundleId) {
      const flavorCollection = await this._getFlavorCollection(collectionHandle);

      this.bundleItems = this.cart.items
        .filter(item => String(item.properties?._bundle_id) === String(bundleId))
        .filter(item => String(item.properties?._bundle_parent) !== 'true')
        .map(item => ({ ...item }));

      console.log('bundleItems', this.bundleItems);

      this.tempBundle = flavorCollection.map(product => {
        const cartItem = this.bundleItems.find(item =>
          Number(item.product_id) === Number(product.id)
        );

        return {
          id: product.id,
          variantId: product.variants?.[0]?.id,
          key: cartItem?.key ?? null,
          title: product.title,
          price: product.variants?.[0]?.price ?? product.price,
          image: product.images?.[0]?.src ?? '',
          quantity: cartItem?.quantity ?? 0,
          bundleId,
        };
      });

      this.bundleChanged = false;
      // this.showModifyBundle = true;
    },

    setupProgressBar(bundleName) {
      const bundleItems = this.bundleItems;
      const tempBundle = this.tempBundle;

      const totalItems = bundleItems.length + tempBundle.length;
      const completedItems = bundleItems.filter(item => item.quantity > 0).length;

      const progress = (completedItems / totalItems) * 100;
      this.progressBarWidth = `${progress}%`;
      console.log('progressBarWidth', this.progressBarWidth);

      this.activeBundleDetails = this.bundleDetails[bundleName];
      console.log('bundleName', bundleName);
      console.log('activeBundleDetails', this.activeBundleDetails);
    },

    backToCart() {
      this.showModifyBundle = false;
      this.state = '';
    },

    bundleDecrement(id) {
      const item = this.tempBundle.find(item => Number(item.id) === Number(id));
      if (!item) return;

      item.quantity = Math.max(0, item.quantity - 1);

      this.tempBundle = [...this.tempBundle];
      this.bundleChangesDetected();
    },

    bundleIncrement(id) {
      const item = this.tempBundle.find(item => Number(item.id) === Number(id));
      if (!item) return;

      item.quantity += 1;

      this.tempBundle = [...this.tempBundle];
      this.bundleChangesDetected();
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
      this.state = 'isCartDrawer';
    },

    async updateBundle() {
      this.bundleChangesDetected();
      if (!this.bundleChanged) return;

      const updates = {};
      const additions = [];

      this.tempBundle.forEach(item => {
        if (item.key) {
          updates[item.key] = item.quantity;
          return;
        }

        if (item.quantity > 0 && item.variantId) {
          additions.push({
            id: item.variantId,
            quantity: item.quantity,
            properties: {
              _bundle_id: item.bundleId,
            },
          });
        }
      });

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

      // this.showModifyBundle = false;

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