import { Alpine as AlpineType } from 'alpinejs'

/**
 * Credit redemption modal (Inveterate). Lets a member redeem membership store credits without
 * going to checkout: Fully / Partially redeem → the worker generates an Inveterate discount code
 * (REDEEM+…) → we show it (copy) and optionally auto-apply it to the cart session.
 *
 * Talks ONLY to the Wandering Bear worker (POST /apps/wb/redemption — dev: {workerUrl}/dev/redemption);
 * never to Inveterate directly, never holds a key. Worker config is read from the shared
 * [data-wb-account] root (same as account.ts). See docs/tasks/09-redemption.md for the contract.
 *
 * QA: append ?wb_redeem_mock=1 to the account URL to synthesise a REDEEM+MOCK… code client-side
 * (no worker call, no real /discount apply) so the flow is demoable before the worker endpoint ships.
 */

type RedeemConfig = { balanceFormatted?: string; currency?: string }
/** UI-facing shape the modal renders. */
type RedeemResult = {
  code: string
  amount_formatted: string
  new_balance_formatted: string
  currency: string
  apply_url?: string
}
/** Worker POST /credits/redeem response (docs/tasks/09-redemption + worker contracts.ts). */
type WorkerRedeem = {
  code: string | null
  balance: number
  balance_formatted: string
  currency: string
  redeemed: number
  redeemed_formatted: string
}
type Envelope<T> = { ok: true; data: T } | { ok: false; error?: { code?: string; message?: string } }

/** Parse a money string ("$4.20", "1,234.50 kr") to a float in major units. */
const parseMoney = (s: string): number => {
  const n = parseFloat((s || '').replace(/[^0-9.]/g, ''))
  return Number.isFinite(n) ? n : 0
}

export default (Alpine: AlpineType) => {
  Alpine.data('creditRedemption', (config: RedeemConfig = {}) => ({
    isOpen: false,
    isShown: false,
    step: 'select' as 'select' | 'result',
    mode: 'full' as 'full' | 'partial',
    amount: '' as string, // partial input, major units
    loading: false,
    error: null as string | null,
    result: null as RedeemResult | null,
    copied: false,
    balanceFormatted: config.balanceFormatted || '',
    balance: parseMoney(config.balanceFormatted || ''),

    get root(): HTMLElement | null {
      return document.querySelector<HTMLElement>('[data-wb-account]')
    },
    get isMock(): boolean {
      return new URLSearchParams(window.location.search).get('wb_redeem_mock') === '1'
    },

    async open() {
      this.step = 'select'
      this.mode = 'full'
      this.amount = ''
      this.error = null
      this.result = null
      this.copied = false
      document.body.classList.add('no-scroll')
      this.isOpen = true
      await new Promise((r) => setTimeout(r, 50))
      this.isShown = true
    },
    async close() {
      this.isShown = false
      await new Promise((r) => setTimeout(r, 300))
      this.isOpen = false
      document.body.classList.remove('no-scroll')
    },

    /** Worker endpoint: dev surface ({url}/dev/credits/redeem?customerId=[&token=]) or App Proxy
     *  (/apps/wb/credits/redeem). */
    endpoint(): string {
      const root = this.root
      const workerUrl = (root?.dataset.workerUrl ?? '').trim().replace(/\/$/, '')
      if (workerUrl) {
        const u = new URL(`${workerUrl}/dev/credits/redeem`)
        u.searchParams.set('customerId', root?.dataset.customerId ?? '')
        const token = (root?.dataset.workerToken ?? '').trim()
        if (token) u.searchParams.set('token', token)
        return u.toString()
      }
      return new URL('/apps/wb/credits/redeem', window.location.origin).toString()
    },

    async submit() {
      this.error = null
      const partial = this.mode === 'partial'
      const amt = parseMoney(this.amount)
      if (partial && (!(amt > 0) || amt > this.balance + 1e-9)) {
        this.error = 'invalid_amount'
        return
      }
      this.loading = true
      try {
        this.result = this.isMock
          ? await this.mockRedeem(partial ? amt : this.balance)
          : await this.realRedeem(partial ? { amount: Math.round(amt * 100) } : {})
        this.step = 'result'
      } catch (e) {
        this.error = (e as Error).message || 'redemption_failed'
      } finally {
        this.loading = false
      }
    },

    async realRedeem(body: { amount?: number }): Promise<RedeemResult> {
      const usesWorker = (this.root?.dataset.workerUrl ?? '').trim() !== ''
      const res = await fetch(this.endpoint(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: usesWorker ? 'omit' : 'same-origin',
        body: JSON.stringify(body),
      })
      const json = (await res.json()) as Envelope<WorkerRedeem>
      if (!json.ok) throw new Error(json.error?.code || 'redemption_failed')
      const d = json.data
      // Map the worker shape → the UI shape (redeemed = the amount just spent; balance = remaining).
      return {
        code: d.code || '',
        amount_formatted: d.redeemed_formatted,
        new_balance_formatted: d.balance_formatted,
        currency: d.currency,
      }
    },

    /** Client-side mock (QA only, ?wb_redeem_mock=1) — assumes a $ currency for display. */
    async mockRedeem(amount: number): Promise<RedeemResult> {
      await new Promise((r) => setTimeout(r, 600))
      const fmt = (n: number) => `$${n.toFixed(2)}`
      const rand = Math.random().toString(36).slice(2, 8).toUpperCase()
      return {
        code: `REDEEM+MOCK${rand}`,
        amount_formatted: fmt(amount),
        new_balance_formatted: fmt(Math.max(0, this.balance - amount)),
        currency: config.currency || 'USD',
      }
    },

    /** Shopify discount URL — encode the code (`+` → `%2B`) and land back on the cart. */
    applyUrl(): string {
      return this.result?.apply_url || `/discount/${encodeURIComponent(this.result?.code || '')}?redirect=/cart`
    },
    applyToCart() {
      if (this.isMock) return // a mock code can't be applied for real
      window.location.href = this.applyUrl()
    },
    async copyCode() {
      try {
        await navigator.clipboard.writeText(this.result?.code || '')
        this.copied = true
        setTimeout(() => {
          this.copied = false
        }, 2000)
      } catch {
        /* clipboard blocked — the code is visible for manual copy */
      }
    },
  }))
}
