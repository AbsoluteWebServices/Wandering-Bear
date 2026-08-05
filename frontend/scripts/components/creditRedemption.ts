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
  /** Balance right now — unchanged by generating the code, since Inveterate deducts on use. */
  new_balance_formatted: string
  /** What the member will be left with once this code is actually applied to an order:
   *  current balance minus the code's value. This is the figure the modal leads with. */
  remaining_after_use_formatted: string
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

/** Render `value` using the shape of an existing money string, so the currency symbol and its
 *  placement come from whatever the worker already formatted ("$9.00", "9,00 kr") instead of being
 *  hard-coded here. Falls back to the plain number if the sample has no digits to swap. */
const formatLike = (sample: string, value: number): string => {
  const amount = Math.max(0, value).toFixed(2)
  return /[\d]/.test(sample || '') ? sample.replace(/[\d.,]+/, amount) : amount
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

    /** Build a worker URL for `path`: dev surface ({url}/dev/<path>?customerId=[&token=]) or
     *  App Proxy (/apps/wb/<path>). */
    workerPath(path: string): string {
      const root = this.root
      const workerUrl = (root?.dataset.workerUrl ?? '').trim().replace(/\/$/, '')
      if (workerUrl) {
        const u = new URL(`${workerUrl}/dev/${path}`)
        u.searchParams.set('customerId', root?.dataset.customerId ?? '')
        const token = (root?.dataset.workerToken ?? '').trim()
        if (token) u.searchParams.set('token', token)
        return u.toString()
      }
      return new URL(`/apps/wb/${path}`, window.location.origin).toString()
    },
    endpoint(): string {
      return this.workerPath('credits/redeem')
    },

    /** Re-read the balance from the worker and repaint every [data-wb-credit-balance] on the page
     *  — the dashboard card(s) and the header widget, which are otherwise server-rendered once and
     *  never touched again.
     *
     *  Generating a code does not move the balance (Inveterate deducts when the code is applied to
     *  an order), so straight after a redemption this normally repaints the same number — that is
     *  correct, not a no-op bug. It exists so the figure on screen is the live one rather than
     *  whatever was server-rendered on page load: a code redeemed in another tab, an expiry, or
     *  credits earned meanwhile would otherwise leave a stale number sitting there. */
    async syncBalance(): Promise<void> {
      try {
        const usesWorker = (this.root?.dataset.workerUrl ?? '').trim() !== ''
        const res = await fetch(this.workerPath('credits'), {
          headers: { Accept: 'application/json' },
          credentials: usesWorker ? 'omit' : 'same-origin',
        })
        const json = (await res.json()) as Envelope<{ balance_formatted?: string }>
        if (!json.ok) return
        const formatted = json.data?.balance_formatted
        if (!formatted) return
        document.querySelectorAll<HTMLElement>('[data-wb-credit-balance]').forEach((el) => {
          el.textContent = formatted
        })
        this.balanceFormatted = formatted
        this.balance = parseMoney(formatted)
        if (this.result) {
          this.result.new_balance_formatted = formatted
          // Keep the headline figure consistent with the balance we just read.
          this.result.remaining_after_use_formatted = formatLike(
            formatted,
            parseMoney(formatted) - parseMoney(this.result.amount_formatted),
          )
        }
      } catch {
        /* leave the server-rendered value in place */
      }
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
        // The code exists now, so never fail the flow on this — it only refreshes what's on screen.
        if (!this.isMock) await this.syncBalance()
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
      // Map the worker shape → the UI shape. `redeemed` is the code's value; `balance` is the
      // member's balance, which by design does NOT move when the code is generated — Inveterate
      // deducts when the code is applied to an order. So what the member wants to know is
      // balance - redeemed, which is what the modal leads with.
      return {
        code: d.code || '',
        amount_formatted: d.redeemed_formatted,
        new_balance_formatted: d.balance_formatted,
        remaining_after_use_formatted: formatLike(
          d.balance_formatted,
          parseMoney(d.balance_formatted) - parseMoney(d.redeemed_formatted),
        ),
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
        // Mirrors the real flow: the balance stays put until the code is used.
        new_balance_formatted: fmt(this.balance),
        remaining_after_use_formatted: fmt(Math.max(0, this.balance - amount)),
        currency: config.currency || 'USD',
      }
    },

    /** Where to land after Shopify stores the code on the cart session.
     *  QA #48: /cart with an empty cart bounces the member to the home page, which reads as though
     *  applying the code did nothing. With nothing in the cart we send them to the catalogue
     *  instead, so the code they just applied has something to be spent on. The same fallback is
     *  used when /cart.js is unreachable — the catalogue never bounces, /cart might. */
    async applyRedirect(): Promise<string> {
      try {
        const res = await fetch('/cart.js', { headers: { Accept: 'application/json' } })
        const cart = (await res.json()) as { item_count?: number }
        return (cart.item_count ?? 0) > 0 ? '/cart' : '/collections/all'
      } catch {
        return '/collections/all'
      }
    },

    /** Shopify discount URL — encode the code (`+` → `%2B`). Built here rather than using the
     *  worker's apply_url, because that one hard-codes redirect=/cart and we need to choose. */
    async applyToCart(): Promise<void> {
      if (this.isMock) return // a mock code can't be applied for real
      const code = this.result?.code || ''
      if (!code) return
      // redirect is a fixed internal literal, so it goes in raw — the documented Shopify form,
      // and the one this flow already worked with. Only the code needs encoding (`+` → `%2B`).
      const redirect = await this.applyRedirect()
      window.location.href = `/discount/${encodeURIComponent(code)}?redirect=${redirect}`
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
