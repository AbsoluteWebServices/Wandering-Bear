import { CartUpdateEvent } from '../../../assets/events';

export default (Alpine: AlpineType) => {
    Alpine.store('cart', {
        state: 'isCartDrawer',
        cart: null,

      });
      
      Alpine.data('cart', () => ({
        showModifyBundle: false,
        bundleItems: [],
        newBundleItems: [],
        bundleChanged: false,

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
          await this.refreshCart();
        },
      
        async refreshCart() {
          this.cart = await fetch('/cart.js', {
            headers: { Accept: 'application/json' },
          }).then(r => r.json());

          console.log('state', Alpine.store('cart').state);

        },
      
        async removeBundle(bundleId) {
          const updates = {};
      
          this.cart.items
            .filter(item => item.properties?._bundle_id === bundleId)
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
        },
      
        async changeState(state) {
          this.state = state;
          Alpine.store('cart').state = state;
          console.log('state', Alpine.store('cart').state);
        //   await this.refreshCart();
        },
      
        modifyBundle(bundleId) {
            this.hydrateModifyBundle(bundleId);
        },

        hydrateModifyBundle(bundleId) {
            this.bundleItems = this.cart.items
              .filter(item => String(item.properties?._bundle_id) === String(bundleId))
              .filter(item => String(item.properties?._bundle_parent) !== 'true')
              .map(item => ({ ...item }));
          
            this.newBundleItems = this.bundleItems.map(item => ({ ...item }));
          
            this.bundleChanged = false;
            this.showModifyBundle = true;
          },
          
          bundleDecrement(key) {
            const item = this.newBundleItems.find(item => item.key === key);
            if (!item || item.quantity <= 0) return;
          
            item.quantity--;
          
            this.newBundleItems = [...this.newBundleItems];
            this.bundleChangesDetected();
          },
          
          bundleIncrement(key) {
            const item = this.newBundleItems.find(item => item.key === key);
            if (!item) return;
          
            item.quantity++;
          
            this.newBundleItems = [...this.newBundleItems];
            this.bundleChangesDetected();
          },
          
          bundleChangesDetected() {
            this.bundleChanged = this.newBundleItems.some(newItem => {
              const originalItem = this.bundleItems.find(item => item.key === newItem.key);
              return originalItem?.quantity !== newItem.quantity;
            });
          },
          
          async updateBundle() {
            this.bundleChangesDetected();
          
            if (!this.bundleChanged) return;
          
            const updates = {};
          
            this.newBundleItems.forEach(item => {
              updates[item.key] = item.quantity;
            });
          
            console.log('updates', updates);
          
            const res = await fetch('/cart/update.js', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
              },
              body: JSON.stringify({ updates }),
            });
          
            if (!res.ok) {
              console.error(await res.text());
              return;
            }
          
            this.cart = await res.json();
          
            document.dispatchEvent(
              new CartUpdateEvent(this.cart, 'cart', {
                itemCount: this.cart.item_count,
                source: 'cart',
              })
            );
          
            this.showModifyBundle = false;
            this.bundleChanged = false;
          }
      }));
};
