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
  // Bare Shopify order id. Optional: a worker older than this theme does not send it, and the id is
  // then recovered from order_name.
  order_id?: string | null;
  description: string;
  // This entry's own expiry (earn rows only) — drives the row's "Expires on …" / "Expired" note.
  expires_at: string | null;
  // Running balance after this entry; transactions[0].balance_after === balance.
  balance_after: number;
  balance_after_formatted: string;
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
// Attribute is data-wb-portal-url → dataset key wbPortalUrl (the `wb` prefix is part of the name).
const portalUrl = (root?.dataset.wbPortalUrl ?? '').trim();

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

/** Format an ISO date (YYYY-MM-DD) as MM/DD/YYYY — the format Figma uses for every date on the
 *  dashboard: the credit expiry ("Expires 01/01/2028") and the autoship line
 *  ("Next shipment: 07/25/2025", frame 1:177). Anything unparseable returns null so callers can
 *  leave the SSR fallback in place. */
function formatUsDate(iso: string | null): string | null {
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

/** Clean a worker title: drop the selling-plan / pricing suffix the worker appends after an
 *  em-dash (U+2014), e.g. "Cold Brew On Tap (96 oz) - Mocha—2 Box Discount Price" → the flavour.
 *  Product names use a hyphen "-" or en-dash "–", so the em-dash reliably marks the suffix.
 *  This also collapses the duplicated "A—A" bundle title (first part === the name). */
function dedupeTitle(t: string): string {
  const head = t.split('—')[0].trim();
  return head || t;
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
  setExpiryLine(formatUsDate(m.credits.expires_at));

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
  const hasActive = subs.active_count > 0;
  // Feature the soonest upcoming ACTIVE subscription. The worker may list a cancelled
  // subscription before the active one, so don't blindly take subsList[0] — pick the
  // active entry with the nearest next order date. Fall back to the first entry (for the
  // cancelled-state card) only when there's no active subscription.
  const activeSubs = subsList
    .filter((s) => s.status === 'ACTIVE')
    .sort((a, b) => (a.next_order_date ?? '9999-99-99').localeCompare(b.next_order_date ?? '9999-99-99'));
  const first = hasActive ? (activeSubs[0] ?? subsList[0]) : subsList[0];
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

  // The worker may merge several bundles' line items into one subscription and label
  // bundle_title with the first line item (often a flavour, not a bundle). Prefer a real
  // bundle line ("…Bundle…") for the headline; list only flavour items (drop every bundle
  // line) so "+N more" counts flavours, not bundle rows. Surface the headline bundle's own
  // flavour first by matching box size (e.g. "1 Box").
  const isBundleTitle = (t: string): boolean => /bundle/i.test(t);
  const boxSize = (t: string): string => t.match(/(\d+)\s*box/i)?.[1] ?? '';
  const bundleLines = first.line_items.filter((li) => isBundleTitle(li.title));
  const headlineTitle = bundleLines[0]?.title ?? first.bundle_title;
  const headlineBox = boxSize(headlineTitle);
  const flavourItems = first.line_items
    .filter((li) => !isBundleTitle(li.title))
    .sort((a, b) => {
      const am = headlineBox && boxSize(a.title) === headlineBox ? 0 : 1;
      const bm = headlineBox && boxSize(b.title) === headlineBox ? 0 : 1;
      return am - bm;
    });

  setText(card, 'autoship-bundle', dedupeTitle(headlineTitle));
  // QA #26: the worker hands back an ISO date, which was written into the DOM raw
  // ("Next shipment: 2027-04-29"). Figma shows "Next shipment: 07/25/2025" (frame 1:177).
  if (!isCancelled) setText(card, 'autoship-date', formatUsDate(first.next_order_date) ?? undefined);


  if (!isCancelled) {
    const countEl = card.querySelector<HTMLElement>('[data-wb-autoship-count]');
    if (countEl) {
      const attr = subs.active_count === 1 && countEl.hasAttribute('data-wb-count-template-one')
        ? 'data-wb-count-template-one'
        : 'data-wb-count-template';
      countEl.textContent = fillTemplate(countEl, attr, subs.active_count);
    }
  }

  // "+N more" and the Manage control target the SAME Stay AI portal. Capture the manage anchor's
  // SSR href (settings.manage_autoship_url, default /apps/retextion) as the shared fallback so
  // "+N more" never dead-ends on '#' when the worker's portal_url is empty.
  const manageLink = card.querySelector<HTMLAnchorElement>('[data-wb-autoship-manage] a');
  const manageHref = manageLink?.getAttribute('href') || '#';

  // Line-item list (flavours only; show up to 2, "+N more" → same target as Manage Upcoming Orders).
  const list = card.querySelector<HTMLElement>('[data-wb-autoship-items]');
  if (list && flavourItems.length) {
    const shown = flavourItems.slice(0, 2);
    const more = Math.max(0, flavourItems.length - shown.length);
    const moreLabel = fillTemplate(list, 'data-wb-more-template', more);
    list.textContent = '';
    shown.forEach((li, i) => {
      const row = document.createElement('li');
      row.className =
        'flex items-center justify-between !gap-2 font-kurdis-semi-condensed font-bold text-xs leading-none text-[#955325]';
      const itemTitle = document.createElement('span');
      itemTitle.textContent = dedupeTitle(li.title);
      row.appendChild(itemTitle);
      if (i === shown.length - 1 && more > 0) {
        const link = document.createElement('a');
        link.href = subs.portal_url || portalUrl || manageHref;
        link.className = 'hover-underline shrink-0 whitespace-nowrap text-[#955325]';
        link.textContent = moreLabel;
        row.appendChild(link);
      }
      list.appendChild(row);
    });
  }

  // MANAGE / REACTIVATE controls → per-customer Stay AI portal from the worker's portal_url (Stay AI
  // generate-portal-link token). Overrides the SSR base href (settings.manage_autoship_url,
  // which auto-detects the logged-in member); falls back to it when portal_url is empty.
  if (subs.portal_url) {
    card
      .querySelectorAll<HTMLAnchorElement>('[data-wb-autoship-manage] a, [data-wb-autoship-reactivate] a')
      .forEach((a) => { a.href = subs.portal_url; });
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** ISO date (YYYY-MM-DD) → "Aug 21, 2024" for the credit-history table. */
function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${MONTHS[+m[2] - 1]} ${+m[3]}, ${m[1]}` : iso;
}

type OrderRef = { name: string; url: string | null };

/**
 * id → { name, url } for the logged-in customer's orders, rendered into the page by
 * sections/customer-credits.liquid.
 *
 * The worker cannot supply either value from Inveterate alone: the ledger holds a numeric order id,
 * while the customer knows the NAME ("#1042") and the order page is addressed by a token. Liquid has
 * both, for this customer only, so the lookup happens here.
 */
function readOrderMap(): Map<string, OrderRef> {
  const el = document.querySelector('[data-wb-order-map]');
  if (!el?.textContent) return new Map();
  try {
    return new Map(Object.entries(JSON.parse(el.textContent) as Record<string, OrderRef>));
  } catch {
    return new Map();
  }
}

/**
 * The order line for a transaction, or null when it cannot be shown honestly.
 *
 * The Liquid map wins: it is the only source with the customer-facing URL. Failing that, the
 * worker's own name is used — but only when it is a NAME. A worker older than this theme echoes the
 * ledger's raw id as "#6750479450209", which reads like an order number without being one and links
 * to a page that redirects to /account. Shopify order ids run 10+ digits and order names do not, so
 * the shape tells them apart; anything that looks like a bare id is dropped rather than shown.
 */
function resolveOrder(t: CreditTxn, orders: Map<string, OrderRef>): OrderRef | null {
  const name = t.order_name ?? '';
  const looksLikeRawId = /^#?\d{10,}$/.test(name);
  const id = (t.order_id ?? (looksLikeRawId ? name : '')).replace(/\D/g, '');
  const known = id ? orders.get(id) : undefined;
  if (known) return known;
  if (name && !looksLikeRawId) return { name, url: t.order_url };
  return null;
}

/** Is this entry's own expiry already past? Earn rows only — a debit has no expiry of its own. */
function isExpired(t: CreditTxn, nowMs: number): boolean {
  return t.type === 'EXPIRED' || (t.expires_at != null && Date.parse(t.expires_at) <= nowMs);
}

/** Build the "Date and type" cell: date, description, order link, expiry note (Figma 1:1208). */
function dateTypeCell(t: CreditTxn, tbody: HTMLElement, nowMs: number, order: OrderRef | null): HTMLTableCellElement {
  const td = document.createElement('td');

  const date = document.createElement('div');
  date.className = 'wb-credit-history__date';
  date.textContent = formatDate(t.date);
  td.appendChild(date);

  // Upstream wording ("Earned from purchase") when there is any, else the translated type — the
  // Inveterate reason is free text and can come back empty.
  const desc = document.createElement('div');
  desc.className = 'wb-credit-history__desc';
  desc.textContent =
    t.description ||
    tbody.getAttribute(`data-wb-type-${t.type.toLowerCase()}`) ||
    t.type.charAt(0) + t.type.slice(1).toLowerCase();
  td.appendChild(desc);

  // The order line only appears when the worker actually resolved one (see orderRef() — the
  // Inveterate ledger's order field is undocumented, so it is often null).
  // `order` is what resolveOrder() settled on — the Liquid map's name and tokened URL. Never
  // t.order_name / t.order_url directly: those still carry the ledger's raw id on a worker older
  // than this theme, which is the bug QA reported.
  if (order) {
    const orderEl = document.createElement(order.url ? 'a' : 'span');
    orderEl.className = 'wb-credit-history__order';
    orderEl.textContent = `${tbody.getAttribute('data-wb-order-label') || 'Order'} ${order.name}`;
    if (order.url && orderEl instanceof HTMLAnchorElement) orderEl.href = order.url;
    td.appendChild(orderEl);
  }

  // "Expires on Aug 2, 2026" while the credits are live, "Expired" once they are gone.
  const expired = isExpired(t, nowMs);
  if (expired || t.expires_at) {
    const note = document.createElement('div');
    note.className = 'wb-credit-history__expiry';
    if (expired) {
      note.textContent = tbody.getAttribute('data-wb-expired-label') || 'Expired';
    } else {
      const label = tbody.getAttribute('data-wb-expires-label') || 'Expires on';
      note.textContent = `${label} ${formatDate(t.expires_at as string)}`;
    }
    td.appendChild(note);
  }

  return td;
}

/** Show only the rows matching the active tab; swap in the filter-empty note when none match. */
function applyCreditFilter(scope: HTMLElement, filter: string): void {
  // A running balance only means anything on an unbroken sequence. Filtered to Redeemed you get
  // "$0.00" above "$5.00" while the account actually holds $11 — each figure is the true balance
  // after its own entry, but the rows that explain the steps between them are hidden, so the column
  // reads as broken data. It is shown on All and dropped everywhere else (see account.css).
  scope.toggleAttribute('data-wb-credit-filtered', filter !== 'ALL');

  const rows = scope.querySelectorAll<HTMLElement>('[data-wb-credit-rows] tr');
  let last: HTMLElement | null = null;
  rows.forEach((tr) => {
    const match = filter === 'ALL' || tr.dataset.wbCreditType === filter;
    tr.hidden = !match;
    tr.removeAttribute('data-wb-last');
    if (match) last = tr;
  });
  // The row that ends up against the panel border loses its own rule (see account.css) — which row
  // that is depends on the filter, so it is marked here rather than with CSS :last-child.
  (last as HTMLElement | null)?.setAttribute('data-wb-last', '');
  const note = scope.querySelector<HTMLElement>('[data-wb-credit-filter-empty]');
  if (note) note.hidden = last != null;
}

/** Credit history page: fill the summary-card expiry + the transaction table (GET /credits). */
function renderCredits(d: Credits): void {
  if (!root) return;

  setExpiryLine(formatUsDate(d.expires_at));

  const panel = root.querySelector<HTMLElement>('.wb-credit-history');
  const tbody = root.querySelector<HTMLElement>('[data-wb-credit-rows]');
  if (!panel || !tbody) return;
  const txns = d.transactions ?? [];
  if (!txns.length) {
    // CSS hides the tabs and the header row off this, so an empty account shows one line of copy
    // rather than a column header with nothing under it.
    root.querySelector<HTMLElement>('[data-wb-credit-empty]')?.removeAttribute('hidden');
    return;
  }

  const nowMs = Date.now();
  const orders = readOrderMap();
  tbody.textContent = '';
  txns.forEach((t) => {
    // EARNED always credits, REDEEMED/EXPIRED always debit; ADJUSTED goes either way, so take the
    // sign from the numeric amount rather than assuming a gain.
    const positive = t.type === 'ADJUSTED' ? t.amount >= 0 : t.type === 'EARNED';
    const expired = isExpired(t, nowMs);

    const tr = document.createElement('tr');
    // The tabs filter on this; it is the worker's `type` verbatim, so no mapping table.
    tr.dataset.wbCreditType = t.type;

    const amount = document.createElement('td');
    amount.className = `wb-credit-history__amount${
      expired ? ' wb-credit-history__amount--muted' : positive ? ' wb-credit-history__amount--earned' : ''
    }`;
    // The sign is ours; drop one the worker may already have baked into the formatted amount.
    // Expired credits are shown unsigned: the loss is already said by the greyed "Expired" note,
    // and a "-" next to it reads as a second, separate deduction.
    const bare = t.amount_formatted.replace(/^[-+]/, '');
    amount.textContent = expired ? bare : `${positive ? '+' : '-'}${bare}`;

    const balance = document.createElement('td');
    balance.className = 'wb-credit-history__balance';
    // A worker older than this theme has no balance_after_formatted, and assigning undefined to
    // textContent (a nullable DOMString) empties the cell rather than writing "undefined" — the
    // column then reads as a styling bug instead of missing data. A dash says which it is.
    balance.textContent = t.balance_after_formatted || '—';

    tr.append(dateTypeCell(t, tbody, nowMs, resolveOrder(t, orders)), amount, balance);
    tbody.appendChild(tr);
  });

  // Tabs: filter the rows already in the DOM — no second request, no re-render.
  const tabs = panel.querySelectorAll<HTMLElement>('[data-wb-credit-filter]');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((other) => other.setAttribute('aria-selected', String(other === tab)));
      applyCreditFilter(panel, tab.dataset.wbCreditFilter || 'ALL');
    });
  });
  applyCreditFilter(panel, 'ALL');
}

/** Dev-only state override for QA: `/account?wb_qa=1&wb_autoship=cancelled&wb_active_count=2&…`
 *  builds a synthetic summary so subscription / progress / expiry can be flipped live on the real
 *  dashboard without touching Stay AI / Inveterate. Tier + credit balance stay SSR-native (from the
 *  Shopify tag + metafield) — use the /pages QA preview to vary those. Returns null when not in QA. */
function qaOverride(): Summary | null {
  const p = new URLSearchParams(window.location.search);
  if (p.get('wb_qa') !== '1') return null;
  const autoship = p.get('wb_autoship') || 'none'; // none | active | cancelled
  const active = autoship === 'active';
  const count = active ? Math.max(1, parseInt(p.get('wb_active_count') || '1', 10) || 1) : 0;
  const items = (p.get('wb_items') || '').split('|').filter(Boolean)
    .map((title) => ({ title, quantity: 1, variant_id: '', image_url: null }));
  const extra = parseInt(p.get('wb_more') || '0', 10) || 0;
  const subscriptions = autoship === 'active' || autoship === 'cancelled'
    ? [{
        id: 'qa', status: active ? 'ACTIVE' : 'CANCELLED', next_order_date: p.get('wb_next_date') || null,
        bundle_title: p.get('wb_bundle') || 'QA Autoship', frequency: { interval: 'month', interval_count: 1, label: '' },
        line_items: items, items_total: items.length + extra,
        price: { amount: 0, formatted: '', currency: 'USD' }, manage_url: '', can_edit: false, can_cancel: false,
      }]
    : [];
  const nextTier = p.get('wb_progress_tier');
  return {
    membership: {
      tier: p.get('wb_tier') || '',
      credits: { balance: 0, balance_formatted: '', currency: 'USD', expires_at: p.get('wb_expiry') || null },
      progress: nextTier
        ? { next_tier: nextTier, percent: parseInt(p.get('wb_progress_percent') || '0', 10) || 0,
            amount_to_next: 0, amount_to_next_formatted: '', message: p.get('wb_progress_text') || '' }
        : null,
      benefits: [],
    },
    subscriptions: { active_count: count, portal_url: '', subscriptions },
  };
}

/** Dev-only credit history for QA: `/pages/credit-history?wb_qa=1` renders the rows drawn in Figma
 *  1:1208 (earn, expired earn, redeem) without a worker or an enrolled member. `wb_rows=0` gives
 *  the empty state. Mirrors qaOverride() for the dashboard; returns null when not in QA. */
function qaCredits(): Credits | null {
  const p = new URLSearchParams(window.location.search);
  if (p.get('wb_qa') !== '1') return null;
  const row = (
    type: CreditTxn['type'], amount: string, date: string, description: string,
    order: string | null, expires: string | null, balance: string,
  ): CreditTxn => ({
    id: `qa-${date}`, type, amount: 0, amount_formatted: amount, date, description,
    // An order NAME, as the customer knows it — not the ledger's numeric id. The URL is left null
    // because only Liquid can produce the tokened one, and the preview has no logged-in customer.
    order_name: order, order_url: null,
    expires_at: expires, balance_after: 0, balance_after_formatted: balance,
  });
  // A live "Expires on …" row has to sit in the future or it renders as expired, so the two earn
  // rows carry a rolling +60d / +30d expiry rather than the Figma's fixed (and now past) dates.
  const inDays = (n: number): string => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
  // Amounts are the widest the worker actually formats ($2120.00, no thousands separator) rather
  // than the frame's tidy "+$5": at 375 a real balance is what pushes the three columns off the
  // panel, so the preview has to show that case, not hide it.
  const transactions = p.get('wb_rows') === '0' ? [] : [
    row('EARNED', '$2000.00', '2026-06-03', 'Earned from purchase', '#1042', inDays(60), '$2120.00'),
    row('EXPIRED', '$100.00', '2026-06-02', 'Earned from purchase', '#1038', null, '$120.00'),
    row('EARNED', '$20.00', '2026-05-03', 'Earned from purchase', '#1031', inDays(30), '$20.00'),
    row('REDEEMED', '$1000.00', '2026-05-02', 'Redeemed at checkout', null, null, '$0.00'),
  ];
  return {
    balance: 1500, balance_formatted: '$15', currency: 'USD',
    expires_at: p.get('wb_expiry') || '2028-01-01',
    transactions,
    pagination: { page: 1, per_page: 50, total: transactions.length, has_next: false },
  };
}

async function hydrate(): Promise<void> {
  if (!root) return;
  if (root.querySelector('[data-wb-credit-history]')) {
    const qaRows = qaCredits();
    if (qaRows) {
      renderCredits(qaRows);
      root.removeAttribute('data-wb-loading');
      return;
    }
  }
  const qa = qaOverride();
  if (qa) {
    renderMembership(qa.membership);
    renderSubscriptions(qa.subscriptions);
    root.removeAttribute('data-wb-loading');
    return;
  }
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

/** QA #49: the order-history timeframe control is a transparent <select> stretched over the whole
 *  box so a tap anywhere opens the native picker. That means the visible value is our own styled
 *  text, not the select's, so mirror the chosen option into it. Runs outside hydrate() — it is
 *  plain DOM wiring and must work even when the worker is unreachable. */
function wireTimeframe(): void {
  document.querySelectorAll<HTMLSelectElement>('[data-wb-timeframe]').forEach((select) => {
    const label = select.parentElement?.querySelector<HTMLElement>('[data-wb-timeframe-value]');
    if (!label) return;
    label.textContent = select.value;
    select.addEventListener('change', () => {
      label.textContent = select.value;
    });
  });
}

function init(): void {
  wireTimeframe();
  void hydrate();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
