/**
 * Account dashboard hydration.
 *
 * Fetches the account summary from the Wandering Bear worker (Inveterate membership
 * + Stay AI subscriptions) and fills the server-rendered dashboard with real data.
 *
 * Why its own entrypoint (not a global Alpine component): the global Alpine bundle
 * inits lazily on first interaction, but account data must appear on load. This
 * module runs eagerly and is injected only on account templates via `vite-tag`.
 *
 * Architecture: tier + card layout are server-rendered (native Inveterate tags), so
 * there is no flash / layout shift. The worker is the source of truth for the data
 * *inside* those cards — credit balance/expiry, tier progress, and the (net-new)
 * Stay AI autoship card. If the worker is unreachable, the SSR fallback values stay.
 *
 * Contract: docs/01-api-contracts — GET /apps/wb/summary → { ok, data: Summary }.
 */

type Money = { amount: number; formatted: string; currency: string };

type Membership = {
  tier: string;
  credits: { balance: number; balance_formatted: string; currency: string; expires_at: string | null };
  progress: {
    next_tier: string | null;
    percent: number;
    amount_to_next: number;
    amount_to_next_formatted: string;
    message: string;
  } | null;
  benefits: string[];
};

type Subscription = {
  id: string;
  status: string;
  next_order_date: string | null;
  bundle_title: string;
  frequency: { interval: string; interval_count: number; label: string };
  line_items: { title: string; quantity: number; variant_id: string; image_url: string | null }[];
  items_total: number;
  price: Money;
  manage_url: string;
  can_edit: boolean;
  can_cancel: boolean;
};

type Subscriptions = { active_count: number; portal_url: string; subscriptions: Subscription[] };

type Summary = {
  membership: Membership | null;
  subscriptions: Subscriptions | null;
  errors?: { section: string; code: string }[];
};

/** Format an ISO date (YYYY-MM-DD) as MM/DD/YYYY (Figma credit-expiry format). */
function formatExpiry(iso: string | null): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  return `${m[2]}/${m[3]}/${m[1]}`;
}

/** Set textContent on every node matching the hook, skipping empty values. */
function setText(root: ParentNode, hook: string, value: string | null | undefined): void {
  if (value == null || value === '') return;
  root.querySelectorAll<HTMLElement>(`[data-wb-${hook}]`).forEach((el) => {
    el.textContent = value;
  });
}

function hydrateMembership(root: HTMLElement, m: Membership): void {
  // Credit balance + expiry (both the wide FREE block and the compact VIP/ELITE card
  // carry these hooks; the expiry hook wraps only the date so the label stays static).
  setText(root, 'credit', m.credits.balance_formatted);
  setText(root, 'credit-expiry', formatExpiry(m.credits.expires_at));

  if (m.progress) {
    const bar = root.querySelector<HTMLElement>('[data-wb-progress-bar]');
    if (bar) bar.style.width = `${Math.max(0, Math.min(100, m.progress.percent))}%`;
    setText(root, 'progress-tier', m.progress.next_tier ?? undefined);
    setText(root, 'progress-text', m.progress.message);
  }
}

function hydrateAutoship(root: HTMLElement, subs: Subscriptions): void {
  const card = root.querySelector<HTMLElement>('[data-wb-autoship]');
  if (!card) return; // FREE layout renders no autoship card — nothing to fill.

  const first = subs.subscriptions[0];
  if (!first) return;

  const isCancelled = first.status !== 'ACTIVE';
  card.setAttribute('data-wb-autoship-state', isCancelled ? 'cancelled' : 'active');
  setText(card, 'autoship-bundle', first.bundle_title);
  setText(card, 'autoship-date', first.next_order_date ?? undefined);

  // TODO(VIP/ELITE account): rebuild the line-item list + "+N more" from
  // first.line_items / items_total, and the active-count badge, once we have a
  // non-FREE test customer to verify against (needs a localized "+N more" label).
}

function resolveEndpoint(root: HTMLElement): { url: string; credentials: RequestCredentials } {
  const base = (root.getAttribute('data-wb-worker') ?? '').trim().replace(/\/$/, '');
  if (base) {
    // Direct to the worker's /dev surface (no Shopify App Proxy). customerId is passed
    // explicitly; the worker must run with DEV_MODE=1. Cross-origin, so no credentials.
    const customerId = root.getAttribute('data-customer-id') ?? '';
    return {
      url: `${base}/dev/summary?customerId=${encodeURIComponent(customerId)}`,
      credentials: 'omit',
    };
  }
  // No worker base set → signed same-origin path: Shopify App Proxy appends the
  // logged_in_customer_id + signature server-side.
  return { url: '/apps/wb/summary', credentials: 'same-origin' };
}

async function init(): Promise<void> {
  const root = document.querySelector<HTMLElement>('[data-wb-account]');
  if (!root) return;

  const { url, credentials } = resolveEndpoint(root);

  try {
    const res = await fetch(url, { credentials, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as { ok: boolean; data?: Summary };
    if (!body.ok || !body.data) throw new Error('bad envelope');

    if (body.data.membership) hydrateMembership(root, body.data.membership);
    if (body.data.subscriptions) hydrateAutoship(root, body.data.subscriptions);
    root.setAttribute('data-wb-hydrated', 'true');
  } catch (err) {
    // Non-fatal: SSR fallback values remain. Log for local debugging.
    root.setAttribute('data-wb-hydrated', 'error');
    // eslint-disable-next-line no-console
    console.warn('[wb-account] summary fetch failed:', err);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  void init();
}
