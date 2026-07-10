import { Alpine as AlpineType } from 'alpinejs'

type BackInStockConfig = {
  companyId: string
  revision?: string
}

type SubscriptionStatus = 'idle' | 'loading' | 'success' | 'error'

export default (Alpine: AlpineType) => {
  Alpine.data('backInStock', (config: BackInStockConfig) => ({
    companyId: config.companyId,
    revision: config.revision || '2026-04-15',
    email: '',
    status: 'idle' as SubscriptionStatus,
    errorMessage: '',

    async subscribe(variantId: string | number | null) {
      if (this.status === 'loading') return

      if (!this.email) {
        this.status = 'error'
        this.errorMessage = 'Please enter your email address.'
        return
      }

      if (!variantId) {
        this.status = 'error'
        this.errorMessage = 'Something went wrong. Please try again later.'
        return
      }

      this.status = 'loading'
      this.errorMessage = ''

      const body = {
        data: {
          type: 'back-in-stock-subscription',
          attributes: {
            profile: {
              data: {
                type: 'profile',
                attributes: {
                  email: this.email,
                },
              },
            },
            channels: ['EMAIL'],
          },
          relationships: {
            variant: {
              data: {
                type: 'catalog-variant',
                id: `$shopify:::$default:::${variantId}`,
              },
            },
          },
        },
      }

      try {
        const res = await fetch(
          `https://a.klaviyo.com/client/back-in-stock-subscriptions/?company_id=${this.companyId}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
              revision: this.revision,
            },
            body: JSON.stringify(body),
          }
        )

        if (res.status === 202 || res.ok) {
          this.status = 'success'
          this.email = ''
          return
        }

        const errorResponse = await res.json().catch(() => null)
        this.errorMessage =
          errorResponse?.errors?.[0]?.detail ||
          'Subscription failed. Please try again.'
        this.status = 'error'
      } catch (error) {
        this.errorMessage = 'Network error. Please try again.'
        this.status = 'error'
      }
    },
  }))
}
