/**
 * Account dashboard hydration.
 *
 * Fills the server-rendered dashboard with live data from the Wandering Bear worker
 * (Inveterate membership + Stay AI subscriptions). NEVER talks to Inveterate / Stay AI
 * directly and never holds API keys — it only calls the worker.
 *
 * Own entrypoint (not the global Alpine bundle): Alpine inits lazily on first
 * interaction, but account data must appear on load. This runs eagerly and is injected
 * only on account templates via `vite-tag`.
 *
 * Source of truth: tier name stays SSR-native (drives the card layout). The worker
 * hydrates the data inside the cards — credit balance + expiry, tier progress, autoship.
 * SSR values (native credit metafield, mock progress) are the pre-hydration fallback;
 * if the worker is unreachable they remain and the root gets data-wb-error.
 *
 * Endpoint (data-worker-url on the root):
 *   set   → {url}/dev/<path>?customerId=<id>   (local/dev worker, DEV_MODE=1, CORS)
 *   empty → /apps/wb/<path>                    (Shopify App Proxy, signed customer id)
 * Contract: docs/01-api-contracts — envelope { ok, data } | { ok:false, error }.
 */

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
  // Live Inveterate tier benefits. Not hydrated yet (SSR copy per Figma); typed for
  // when the "What's Included" list is wired to the worker (docs 03 §5).
  benefits: { name: string; description: string; icon: string | null; type: string }[];
};

type Subscription = {
  id: string;
  status: 'ACTIVE' | 'PAUSED' | 'CANCELLED' | string;
  next_order_date: string | null;
  bundle_title: string;
  frequency: { interval: string; interval_count: number; label: string };
  line_items: { title: string; quantity: number; variant_id: string; image_url: string | null }[];
  items_total: number;
  price: { amount: number; formatted: string; currency: string };
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

type CreditTxn = {
  id: string;
  type: 'EARNED' | 'REDEEMED' | 'EXPIRED' | 'ADJUSTED' | string;
  amount: number;
  amount_formatted: string;
  date: string;
  order_name: string | null;
  order_url: string | null;
  description: string;
};

type Credits = {
  balance: number;
  balance_formatted: string;
  currency: string;
  expires_at: string | null;
  transactions: CreditTxn[];
  pagination: { page: number; per_page: number; total: number; has_next: boolean };
};

type Envelope<T> = { ok: true; data: T } | { ok: false; error?: { code?: string; message?: string } };

const root = document.querySelector<HTMLElement>('[data-wb-account]');
const workerUrl = (root?.dataset.workerUrl ?? '').trim().replace(/\/$/, '');
const customerId = root?.dataset.customerId ?? '';
const devToken = (root?.dataset.workerToken ?? '').trim();
// Stay AI customer-portal URL (settings.manage_autoship_url) — target for the autoship
// "+N more" link and the manage control. The worker's portal_url comes back empty.
const portalUrl = (root?.dataset.portalUrl ?? '').trim();

/** Build a worker URL: dev surface ({url}/dev/<path>?customerId=[&token=]) or App Proxy (/apps/wb/<path>). */
function wbUrl(path: string, params: Record<string, string> = {}): string {
  const u = workerUrl
    ? new URL(`${workerUrl}/dev/${path}`)
    : new URL(`/apps/wb/${path}`, window.location.origin);
  if (workerUrl) {
    u.searchParams.set('customerId', customerId);
    if (devToken) u.searchParams.set('token', devToken); // required when the worker sets DEV_TOKEN
  }
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

async function wbFetch<T>(path: string, params?: Record<string, string>): Promise<T> {
  const res = await fetch(wbUrl(path, params), {
    headers: { Accept: 'application/json' },
    credentials: workerUrl ? 'omit' : 'same-origin',
  });
  const json = (await res.json()) as Envelope<T>;
  if (!json.ok) throw new Error(json.error?.code || 'wb_error');
  return json.data;
}

/** Format an ISO date (YYYY-MM-DD) as MM/DD/YYYY (Figma credit-expiry format). */
function formatExpiry(iso: string | null): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : null;
}

/** Fill the credit-expiry line. With a date → "Expires <date>". Without one → the
 *  data-wb-no-expiry fallback (e.g. "Available to redeem") so the line isn't left blank —
 *  an empty gap under the balance reads as broken. Hides the line only if no fallback is set. */
function setExpiryLine(expiry: string | null): void {
  if (!root) return;
  root.querySelectorAll<HTMLElement>('[data-wb-expiry-line]').forEach((el) => {
    if (expiry) {
      const dateEl = el.querySelector<HTMLElement>('[data-wb-credit-expiry]');
      if (dateEl) dateEl.textContent = expiry;
      el.style.display = '';
      return;
    }
    const fallback = el.getAttribute('data-wb-no-expiry');
    if (fallback) {
      el.textContent = fallback;
      el.style.display = '';
    } else {
      el.style.display = 'none';
    }
  });
}

/** Collapse a duplicated worker title ("A—A" → "A"). The worker builds titles as
 *  `headline—<part>`; for some products (e.g. the 96oz bundle) both halves are identical.
 *  Only collapses EXACT-equal halves, so legit "headline—variant" titles are untouched. */
function dedupeTitle(t: string): string {
  const parts = t.split('—');
  return parts.length === 2 && parts[0].trim() === parts[1].trim() ? parts[0].trim() : t;
}

/** Set textContent on every matching hook, skipping empty values. */
function setText(scope: ParentNode, hook: string, value: string | null | undefined): void {
  if (value == null || value === '') return;
  scope.querySelectorAll<HTMLElement>(`[data-wb-${hook}]`).forEach((el) => {
    el.textContent = value;
  });
}

function renderMembership(m: Membership | null): void {
  if (!root || !m) return;

  // Credit BALANCE is native SSR (Inveterate `balance` metafield) — not hydrated here.
  // Only the expiry comes from the worker (there is no native credit-expiry metafield).
  setExpiryLine(formatExpiry(m.credits.expires_at));

  // Progress column. progress === null ⇒ top tier (ELITE) — SSR already hides the column.
  if (m.progress) {
    const bar = root.querySelector<HTMLElement>('[data-wb-progress-bar]');
    if (bar) bar.style.width = `${Math.max(0, Math.min(100, m.progress.percent))}%`;
    setText(root, 'progress-tier', m.progress.next_tier ?? undefined);
    setText(root, 'progress-text', m.progress.message);
  }
  // NOTE: tier name stays SSR-native (drives the card layout); everything else here is
  // from the worker. SSR credit balance is the instant fallback until this overwrites it.
}

/** Fill a localized "__N__ …" template ("__N__ Active Autoships", "+ __N__ more").
 *  Placeholder is brace-free (__N__, not {n}) — a literal `}` inside a Liquid `{{ }}`
 *  expression breaks the parser, which failed snippet validation on upload. */
function fillTemplate(el: HTMLElement | null, templateAttr: string, n: number): string {
  const tpl = el?.getAttribute(templateAttr) ?? '';
  return tpl.replace('__N__', String(n));
}

function renderSubscriptions(subs: Subscriptions | null): void {
  if (!root || !subs) return;

  const subsList = subs.subscriptions ?? [];
  const first = subsList[0];
  const hasActive = subs.active_count > 0;
  // Show the autoship card for an active autoship OR a cancelled-only one (worker returns no
  // active but still has a cancelled subscription); the wide credit block only when there's none.
  const isCancelled = !hasActive && first != null;
  const showCard = (hasActive || isCancelled) && first != null;

  root.querySelector('[data-wb-row-autoship]')?.toggleAttribute('data-wb-hide', !showCard);
  root.querySelector('[data-wb-row-nocard]')?.toggleAttribute('data-wb-hide', showCard);
  if (!showCard || !first) return;

  const card = root.querySelector<HTMLElement>('[data-wb-autoship]');
  if (!card) return;
  // State drives (via CSS) the badge (count vs "Cancelled") and the next-shipment line.
  card.setAttribute('data-wb-autoship-state', isCancelled ? 'cancelled' : 'active');

  // Header: "next" (active) vs "previous" (cancelled) autoship order.
  const title = card.querySelector<HTMLElement>('[data-wb-autoship-title]');
  if (title) {
    const t = title.getAttribute(isCancelled ? 'data-wb-title-prev' : 'data-wb-title-next');
    if (t) title.textContent = t;
  }

  setText(card, 'autoship-bundle', dedupeTitle(first.bundle_title));
  if (!isCancelled) setText(card, 'autoship-date', first.next_order_date ?? undefined);

  // Active-count badge — localized "{n} Active Autoships" (active only; CSS hides it when cancelled).
  if (!isCancelled) {
    const countEl = card.querySelector<HTMLElement>('[data-wb-autoship-count]');
    if (countEl) countEl.textContent = fillTemplate(countEl, 'data-wb-count-template', subs.active_count);
  }

  // Line-item list (show up to 2, "+N more" links to the portal).
  const list = card.querySelector<HTMLElement>('[data-wb-autoship-items]');
  if (list && first.line_items.length) {
    // The worker includes the bundle itself as a line item (title === bundle_title), which
    // duplicates the card headline. Drop it so the list shows only the bundle's components.
    // Fall back to the raw list if filtering would empty it (a bundle with no sub-items).
    const bundleKey = dedupeTitle(first.bundle_title);
    const filtered = first.line_items.filter((li) => dedupeTitle(li.title) !== bundleKey);
    const items = filtered.length ? filtered : first.line_items;
    const removed = first.line_items.length - items.length; // bundle lines dropped from the count
    const total = Math.max(items.length, first.items_total - removed);
    const shown = items.slice(0, 2);
    const more = Math.max(0, total - shown.length);
    const moreLabel = fillTemplate(list, 'data-wb-more-template', more);
    list.textContent = '';
    shown.forEach((li, i) => {
      const row = document.createElement('li');
      row.className =
        'flex items-center justify-between !gap-2 font-kurdis-semi-condensed font-bold text-[10px] leading-none text-[#955325]';
      const title = document.createElement('span');
      title.textContent = dedupeTitle(li.title);
      row.appendChild(title);
      if (i === shown.length - 1 && more > 0) {
        const link = document.createElement('a');
        link.href = subs.portal_url || portalUrl || first.manage_url || '#';
        link.className = 'hover-underline shrink-0 whitespace-nowrap text-[#955325]';
        link.textContent = moreLabel;
        row.appendChild(link);
      }
      list.appendChild(row);
    });
  }

  // MANAGE control → per-customer Stay AI portal from the worker's portal_url (Stay AI
  // generate-portal-link token). Overrides the SSR base href (settings.manage_autoship_url,
  // which auto-detects the logged-in member); falls back to it when portal_url is empty.
  const manage = card.querySelector<HTMLAnchorElement>('[data-wb-autoship-manage] a');
  if (manage && subs.portal_url) manage.href = subs.portal_url;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** ISO date (YYYY-MM-DD) → "Aug 21, 2024" for the credit-history table. */
function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${MONTHS[+m[2] - 1]} ${+m[3]}, ${m[1]}` : iso;
}

/** Credit history page: fill the summary-card expiry + the transaction table (GET /credits). */
function renderCredits(d: Credits): void {
  if (!root) return;

  setExpiryLine(formatExpiry(d.expires_at));

  const tbody = root.querySelector<HTMLElement>('[data-wb-credit-rows]');
  if (!tbody) return;
  const txns = d.transactions ?? [];
  if (!txns.length) {
    root.querySelector<HTMLElement>('[data-wb-credit-empty]')?.removeAttribute('hidden');
    return;
  }

  const label = (t: string): string =>
    tbody.getAttribute(`data-wb-type-${t.toLowerCase()}`) || t.charAt(0) + t.slice(1).toLowerCase();

  tbody.textContent = '';
  txns.forEach((t) => {
    const positive = t.type === 'EARNED' || t.type === 'ADJUSTED';
    const amtColor = t.type === 'EARNED' ? 'text-dark-gold' : t.type === 'EXPIRED' ? 'text-espresso/50' : 'text-espresso';
    const tr = document.createElement('tr');
    tr.className = 'body text-espresso';

    const date = document.createElement('td');
    date.className = 'p-3 border-b border-espresso/10 whitespace-nowrap';
    date.textContent = formatDate(t.date);

    const activity = document.createElement('td');
    activity.className = 'p-3 border-b border-espresso/10';
    activity.textContent = label(t.type);

    const orderCell = document.createElement('td');
    orderCell.className = 'p-3 border-b border-espresso/10 hidden md:!table-cell';
    if (t.order_name) {
      const a = document.createElement('a');
      a.href = t.order_url || '#';
      a.className = 'hover-underline';
      a.textContent = t.order_name;
      orderCell.appendChild(a);
    } else {
      orderCell.textContent = '—';
    }

    const amount = document.createElement('td');
    amount.className = `p-3 border-b border-espresso/10 text-right whitespace-nowrap font-bold ${amtColor}`;
    amount.textContent = `${positive ? '+' : '-'}${t.amount_formatted}`;

    tr.append(date, activity, orderCell, amount);
    tbody.appendChild(tr);
  });
}

async function hydrate(): Promise<void> {
  if (!root) return;
  const isCreditHistory = root.querySelector('[data-wb-credit-history]') != null;
  try {
    if (isCreditHistory) {
      const d = await wbFetch<Credits>('credits', { page: '1', per_page: '50' });
      renderCredits(d);
    } else {
      const data = await wbFetch<Summary>('summary');
      renderMembership(data.membership);
      renderSubscriptions(data.subscriptions);
    }
    root.removeAttribute('data-wb-loading');
  } catch (err) {
    root.setAttribute('data-wb-error', '');
    root.removeAttribute('data-wb-loading');
    // eslint-disable-next-line no-console
    console.warn('[wb-account] fetch failed:', err);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', hydrate, { once: true });
} else {
  void hydrate();
}
