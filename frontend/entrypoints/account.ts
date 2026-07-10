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

type Envelope<T> = { ok: true; data: T } | { ok: false; error?: { code?: string; message?: string } };

const root = document.querySelector<HTMLElement>('[data-wb-account]');
const workerUrl = (root?.dataset.workerUrl ?? '').trim().replace(/\/$/, '');
const customerId = root?.dataset.customerId ?? '';
const devToken = (root?.dataset.workerToken ?? '').trim();

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

/** Set textContent on every matching hook, skipping empty values. */
function setText(scope: ParentNode, hook: string, value: string | null | undefined): void {
  if (value == null || value === '') return;
  scope.querySelectorAll<HTMLElement>(`[data-wb-${hook}]`).forEach((el) => {
    el.textContent = value;
  });
}

function renderMembership(m: Membership | null): void {
  if (!root || !m) return;

  // Credit balance + expiry from the worker (balance_formatted is the source of truth;
  // the native metafield is only the pre-hydration fallback). Expiry label is static SSR.
  setText(root, 'credit', m.credits.balance_formatted);
  const expiry = formatExpiry(m.credits.expires_at);
  setText(root, 'credit-expiry', expiry);
  // No expiry (null → e.g. zero credits): hide the whole "Expires …" line instead of
  // leaving the SSR fallback date showing.
  root.querySelectorAll<HTMLElement>('[data-wb-expiry-line]').forEach((el) => {
    el.style.display = expiry ? '' : 'none';
  });

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

/** Fill a localized "{n} …" template ("{n} Active Autoships", "+ {n} more"). */
function fillTemplate(el: HTMLElement | null, templateAttr: string, n: number): string {
  const tpl = el?.getAttribute(templateAttr) ?? '';
  return tpl.replace('{n}', String(n));
}

function renderSubscriptions(subs: Subscriptions | null): void {
  if (!root || !subs) return;

  const first = subs.subscriptions[0];
  const hasAutoship = subs.active_count > 0 && first != null;

  // Row 1 layout follows the worker's autoship state, independent of tier: show the autoship
  // card + compact credit when there's an active autoship, else the wide credit block.
  root.querySelector('[data-wb-row-autoship]')?.toggleAttribute('data-wb-hide', !hasAutoship);
  root.querySelector('[data-wb-row-nocard]')?.toggleAttribute('data-wb-hide', hasAutoship);
  if (!hasAutoship || !first) return;

  const card = root.querySelector<HTMLElement>('[data-wb-autoship]');
  if (!card) return;
  card.setAttribute('data-wb-autoship-state', 'active');
  setText(card, 'autoship-bundle', first.bundle_title);
  setText(card, 'autoship-date', first.next_order_date ?? undefined);

  // Active-count badge — localized "{n} Active Autoships".
  const countEl = card.querySelector<HTMLElement>('[data-wb-autoship-count]');
  if (countEl) countEl.textContent = fillTemplate(countEl, 'data-wb-count-template', subs.active_count);

  // Line-item list (show up to 2, "+N more" links to the portal).
  const list = card.querySelector<HTMLElement>('[data-wb-autoship-items]');
  if (list && first.line_items.length) {
    const shown = first.line_items.slice(0, 2);
    const more = first.items_total - shown.length;
    const moreLabel = fillTemplate(list, 'data-wb-more-template', more);
    list.textContent = '';
    shown.forEach((li, i) => {
      const row = document.createElement('li');
      row.className =
        'flex items-center justify-between !gap-2 font-kurdis-semi-condensed font-bold text-[10px] leading-none text-[#955325]';
      const title = document.createElement('span');
      title.textContent = li.title;
      row.appendChild(title);
      if (i === shown.length - 1 && more > 0) {
        const link = document.createElement('a');
        link.href = subs.portal_url || first.manage_url || '#';
        link.className = 'hover-underline shrink-0 whitespace-nowrap text-[#955325]';
        link.textContent = moreLabel;
        row.appendChild(link);
      }
      list.appendChild(row);
    });
  }

  // MANAGE control → Stay AI portal. Hide/disable if no portal_url yet.
  const manage = card.querySelector<HTMLElement>('[data-wb-autoship-manage]');
  if (manage) {
    const href = subs.portal_url || first.manage_url;
    if (href) manage.addEventListener('click', () => { window.location.href = href; });
    else manage.setAttribute('data-wb-disabled', '');
  }
}

async function hydrate(): Promise<void> {
  if (!root) return;
  try {
    const data = await wbFetch<Summary>('summary');
    renderMembership(data.membership);
    renderSubscriptions(data.subscriptions);
    root.removeAttribute('data-wb-loading');
  } catch (err) {
    root.setAttribute('data-wb-error', '');
    root.removeAttribute('data-wb-loading');
    // eslint-disable-next-line no-console
    console.warn('[wb-account] summary fetch failed:', err);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', hydrate, { once: true });
} else {
  void hydrate();
}
