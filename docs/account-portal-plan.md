# Account Portal (My Account) — Build Plan

## Context
Wandering Bear theme (Shopify Online Store 2.0, Vite + Tailwind v4 + Alpine.js). Goal: build a custom account portal per Figma (`WB-x-AW-Account-Portal`) on **classic customer accounts (Liquid)**. `templates/customers/` is currently empty — the entire account surface is greenfield. Membership tier and credits are already readable natively (Inveterate), the Elite upsell already works; order history is done natively via `customer.orders`; upcoming autoship (Stay.ai) is net-new and depends on the backend.

**Role:** senior Shopify frontend. Everything follows Shopify standards (Liquid best practices, `{% schema %}`-driven sections, translations via locales, clean Theme Check, a11y, mobile-first responsive).

> ⛔ **Hard rule:** never push to live. Development only via `shopify theme dev` (dev theme, unpublished). Push/publish/deploy are blocked in `.claude/settings.local.json`.
> ⚠️ **Pixel-level detail** (exact spacing, sizes, block order per screen) is finalized against the Figma frames — no direct file access right now (behind auth). The structure/responsive/states below are final; visual tokens get layered in once we have the design or screenshots.

---

## Stack & integrations at a glance (summary)

**Theme:** Shopify OS 2.0, Liquid + Vite + Tailwind v4 + Alpine.js. Account portal = **Legacy (classic) customer accounts** → Liquid templates in `templates/customers/*`, rendered inside `layout/theme.liquid`.

Three data pillars:

| Pillar | Tool | Provides | How we read / write |
|---|---|---|---|
| **Account & orders** | Shopify — Legacy customer accounts | login/register/reset/activate, addresses, order history, order detail, tracking | **Native Liquid** (`customer`, `customer.orders`, `order.*`, `fulfillment.tracking_url`). No backend. |
| **Membership** | **Inveterate** | "Your membership tier", "Progress to next tier", credits balance, credit history + redemption, Elite upsell | **Native Liquid** for tier + balance: `customer.tags` (`inveterate-tier#…`) + `customer.metafields.inveterate.credits_earned`. Elite upsell = `settings.elite_product` + `/cart/add.js`. **Progress to next tier, credit history + redemption = Inveterate Public API 2.0** via the worker (`/apps/wb/membership`, `/apps/wb/credits`), key server-side. |
| **Subscriptions / autoship** | **Stay AI (Retextion)** | "Your next autoship order", all subscriptions, edit / cancel / skip / swap | **Server-side**: Cloudflare Worker behind Shopify **App Proxy** (`/apps/wb/*`) → `api.retextion.com/api/v2`. Read = worker; edit/cancel = Stay AI **customer portal** (recommended) or worker write. API key server-side only. |

**How it fits:** the theme renders everything in Liquid where data is native (accounts, orders, tier, credits balance). Only the two dynamic sources — **subscriptions (Stay AI)** and **credit history/redemption (Inveterate API)** — go through **one worker + one App Proxy**, scoped per member via Shopify's signed `logged_in_customer_id`. No third-party API key ever reaches the browser.

**Golden rules:** never expose API keys client-side · never push to live (`shopify theme dev` only) · source of truth = `CLAUDE.md` + this file · **task breakdown = `docs/tasks/`** (start with `00-context.md`).

---

## Two-part delivery — Part A: Shopify frontend · Part B: Worker
The project splits into two independent workstreams that meet at **one JSON data contract** (App Proxy endpoints). They can be built in parallel; Part A mocks the contract until Part B is live.

### Part A — Shopify frontend (senior Shopify dev, everything per Figma)
- **Scope:** all Liquid `templates/customers/*`, `sections/*`, `snippets/*`, Alpine components, responsive (mobile+desktop) per Figma, locales, Theme Check, a11y.
- **Native data (no backend):** accounts/auth, addresses, order history + tracking (`customer.orders`), Inveterate tier + credits (`customer.tags` + metafields), Elite upsell (`/cart/add.js`).
- **Consumes the worker only** via same-origin `fetch('/apps/wb/…')` against the agreed JSON contract; renders **loading / empty / error** states. **Never sees any API key.**
- **Deliverables:** the files in §2; pixel styling per Figma; `x-cloak`, no FOUC; passes Theme Check.

### Part B — Worker (backend behind Shopify App Proxy)
- **Scope:** one Cloudflare Worker behind **one Shopify App Proxy** (`/apps/wb/*`). Holds **Stay AI (Retextion) + Inveterate** API keys in env. Talks to `api.retextion.com/api/v2` (subscriptions) and `public.inveterateapi.com/v2.0` (credit history/redemption).
- **Routes:** `GET /apps/wb/membership` (Inveterate — tier + progress to next tier) · `GET /apps/wb/subscriptions` (Stay AI, per member) · `GET /apps/wb/credits` (Inveterate credit history, per member) · optional `POST` for cancel/edit (Stay AI) and redemption (Inveterate) — or delegate edit/cancel to the Stay AI portal.
- **Deliverables:** worker source, App Proxy config in the Shopify app, env secrets, the JSON contract, per-customer caching + rate limiting.

### 🔐 Secure data exchange (theme ↔ worker) — mandatory
Subscriptions are sensitive PII → the flow must be locked down:
1. **App Proxy signature (authenticity).** Shopify appends `signature` = HMAC-SHA256 of the sorted query params, signed with the **app shared secret**. The worker **must verify it** and reject on mismatch — this proves the request came through Shopify, not a forged direct hit on the worker URL.
2. **Trusted identity only.** Use Shopify-injected `logged_in_customer_id` as the sole identity. If absent → `401`/empty (not logged in). **Never** accept a customer id/email from the client query/body (spoofable) to decide whose data to return.
3. **Server-side scoping.** Worker maps `logged_in_customer_id` → member email (Admin API / trusted lookup), then queries Stay AI scoped to that member. One member can only ever get their own subscriptions.
4. **Secrets stay server-side.** Stay AI key + Shopify app secret only in Worker env (Cloudflare secrets). Never in theme files, section settings, metafields, or JS.
5. **Response minimization.** Return only UI-needed fields (see contract) — strip payment tokens, internal ids, and any PII the UI doesn't render.
6. **App-Proxy-only.** No permissive CORS; reject any request without a valid signature. Same-origin `/apps/wb/*` means no CORS is needed anyway.
7. **Mutations (edit/cancel).** Prefer routing to Stay AI's portal. If done via the worker: require valid signature + `logged_in_customer_id`, **verify the subscription belongs to that member** before mutating, and guard against replay (short-lived nonce/idempotency key — App Proxy signatures are stable per URL).
8. **Rate limit + cache** per `logged_in_customer_id`; sanitize upstream errors (never leak keys/raw API errors to the client).

### Data contract (interface between Part A and Part B) — `GET /apps/wb/subscriptions`
```json
{
  "member": true,
  "subscriptions": [
    {
      "id": "sub_123",
      "status": "ACTIVE",                        // ACTIVE | PAUSED | CANCELLED
      "next_order_date": "2026-08-01",
      "frequency": { "interval": "month", "count": 1 },
      "line_items": [
        { "title": "Cold Brew 96oz", "variant": "Black", "qty": 2, "price": "39.00", "image": "https://…" }
      ],
      "price": { "subtotal": "78.00", "currency": "USD" },
      "manage_url": "https://portal.stay.ai/…",  // deep-link into Stay AI portal
      "can_edit": true,
      "can_cancel": true
    }
  ]
}
```
Empty/no-autoship → `{ "member": true, "subscriptions": [] }`. Not logged in → `401`. Part A renders "Your next autoship order" from this shape and mocks it until Part B ships.

---

## 0. Confirmed facts (2026-07) — verified against shopify.dev / client
- ✅ **Classic (Legacy) customer accounts.** Store setting is **Legacy** (verified in Admin). ⚠️ But the **theme has no `templates/customers/*` yet**, so Shopify flags it NEW accounts ("Publishing this theme will upgrade you to the new version of customer accounts"). **There is no theme toggle** — adding the classic customer templates (Task 01+) is what "downgrades" the theme. Until then: **never Publish a theme** (it upgrades the whole store to new accounts) and don't click "Upgrade now". Preview via GitHub-connected **draft** themes per branch. Base theme also ships `<shopify-account>` markup in `snippets/header-actions.liquid` to clean up.
- **Form types are correct:** `customer_login`, `recover_customer_password`, `reset_customer_password`, `activate_customer_password`, `create_customer`, `customer_address`.
- **`customer_address` requires a parameter:** `{% form 'customer_address', customer.new_address %}` (create) / `{% form 'customer_address', address %}` (edit); it exposes `set_as_default_checkbox`.
- **Order statuses:** output `order.financial_status_label` / `order.fulfillment_status_label` (localized), not the raw enum.
- **`activate_account` / `reset_password`** are reachable only via the token from the email → test with a real invite/reset email.

---

## 1. Standards & project conventions (mandatory)
- **Classic accounts, Liquid templates** in `templates/customers/*.liquid`. Rendered inside `layout/theme.liquid` (full header/footer). Use `{% layout %}` if a "clean" screen is needed.
- **Sections-first:** each screen's content goes into `sections/*.liquid` with `{% schema %}` (settings/blocks/presets) so content/copy is editable from the Theme Editor. The `customers/*.liquid` template is a thin `{% section '...' %}` wrapper.
- **AW pattern styling:** hand-written Liquid + Tailwind with `!`/`md:!` modifiers, custom typography classes (`.h2`, `.body`, `.font-kurdis-semi-condensed`), inline `{{ color_scheme.settings.* }}`, brand variables (`--color-espresso`, `--color-gold`, ...).
- **Reuse snippets:** `picture`, `wb-button`, `tooltip`, `accordion`, `icons`/`icon`, `membership-widget`, `aw-modal`.
- **JS:** Alpine plugins (`Alpine.data(...)`) in `frontend/scripts/components/*.ts` + registration in `frontend/entrypoints/main.js`. Alpine loads lazily (on first interaction) → render critical content in Liquid (SSR), hide states with `x-cloak`.
- **Text only via locales** (`locales/en.default.json`, `customer.*` namespace) — no hardcoded strings. Money via money filters (`money`, `money_without_trailing_zeros`).
- **Responsive — mobile-first.** Theme's custom breakpoints: `smd = 750px` (tablet), `md = 1024px` (desktop). `md:!` = ≥1024px. Typography has its own 768px threshold.
- **A11y:** semantic tags, `aria-*` on interactive elements, focus states, targets ≥44px, `alt` on images.
- **Theme Check** must pass clean (`shopify theme check`).

---

## 2. File structure (what we create)

### Templates (`templates/customers/`)
| File | Screen |
|---|---|
| `account.liquid` | Dashboard (main) — wrapper over the `account-dashboard` section |
| `order.liquid` | Order page (clicked from history) |
| `login.liquid` | Login (+ recover password form) |
| `register.liquid` | Register |
| `reset_password.liquid` | Reset password |
| `activate_account.liquid` | Activate account |
| `addresses.liquid` | Address book |

### Sections (`sections/`) — new
| Section | Purpose |
|---|---|
| `customer-account-dashboard.liquid` | Dashboard shell: greeting, membership summary, autoship summary, credits, orders preview. Blocks control module order/visibility. |
| `customer-orders.liquid` | Full order history (table/cards, pagination) — used on dashboard (preview) and/or standalone |
| `customer-order.liquid` | Single order details (line items, totals, address, status, tracking) |
| `customer-credits.liquid` | Membership credit history: current balance, redemption, earn/redeem history |
| `customer-stay-portal.liquid` | Wrapper container for the Stay.ai customer portal (restyle background, embed their widget/block) |
| `customer-login.liquid`, `customer-register.liquid`, `customer-addresses.liquid` | Auth/address forms styled to the guide |

### Snippets (`snippets/`) — new (reusable)
| Snippet | Purpose |
|---|---|
| `customer-membership-state.liquid` | **Single source** of tier + credits. Extracts the duplicated `inveterate-tier#...` logic (currently in `membership-widget.liquid` and `membership-modal.liquid`). Assigns `membership_level`, `is_elite`, `credits_earned`, `credits_earned_formatted`. |
| `customer-account-nav.liquid` | Account navigation (Dashboard / Orders / Credits / Subscription / Addresses / Logout) — desktop sidebar/tabs + mobile menu |
| `customer-membership-card.liquid` | Membership-state card (Free/VIP/Elite) + upgrade CTA |
| `customer-autoship-summary.liquid` | "Next autoship order" / cancelled / no-autoship card |
| `customer-credits-badge.liquid` | Large credits badge (for the wide No-autoship state) |
| `customer-order-card.liquid` | Order card/row for history (with tracking link) |
| `customer-order-status.liquid` | Order/fulfillment status badge |
| `customer-empty-state.liquid` | Empty states (no orders, etc.) |

### JS (`frontend/scripts/components/`) — new Alpine plugins
| Component | Purpose |
|---|---|
| `accountTabs.ts` | Account section tabs/switching (mobile), `x-data` + `x-show` |
| `creditRedemption.ts` | Credit redemption (reuses the `addToCart`/POST `/cart/add.js` pattern from `modal.ts`); confirmation/loader |
| (reuse) `modal.ts`, `accordion.ts`, `swiperSlider.ts` | Upgrade modals, accordions in order details, AJAX-loaded history |

Register each in `frontend/entrypoints/main.js` (dynamic `import` + `Alpine.plugin(...)`), following the existing components.

### Locales
Add a `customer.*` namespace to `locales/en.default.json` (+ `*.schema.json` where section settings need it): `customer.account.title`, `customer.orders.*`, `customer.order.*`, `customer.credits.*`, `customer.login.*`, `customer.register.*`, `customer.addresses.*`, statuses, empty states, buttons.

---

## 3. Data & states

### Membership (Inveterate) — ready to read
- Tier via `customer.tags`: `#c4057f2f`→FREE, `#72ccf378`→VIP, `#dc38b982`/`#99a431e2`→ELITE. → **"Your membership tier"** block (native).
- Credits **balance**: `customer.metafields.inveterate.credits_earned` (money filter). ⚠️ The **only** available inveterate metafield today.
- **"Progress to next tier"** block — NOT in a metafield → from **Inveterate Public API 2.0** via the worker (`GET /apps/wb/membership`). Contract: `{ tier, next_tier, metric, current, threshold, remaining, percent }` (metric = spend/points/credits per Inveterate program config — confirm field names in API ref).
- Elite upgrade: `settings.elite_product` (`inveterate-subscription-1`) → `addToCart(variant, 1, selling_plan)` → `/cart/add.js` (conversion at checkout). Reused.

### Order history — native (Liquid)
- `customer.orders` (pagination `{% paginate customer.orders by 10 %}`), fields `order.name`, `order.created_at`, `order.financial_status`, `order.fulfillment_status`, `order.line_items`, `order.total_price`.
- Tracking: `order.fulfillments[].tracking_url` / `tracking_company` / `tracking_number`.
- Order details: the `order` object on `templates/customers/order.liquid`.

### Subscriptions / autoship (Stay AI · Retextion) — ⚠️ requires server-side layer
The client's subscription app is **Stay AI** (Retextion, `app.retextion.com`), installed on Shopify. All autoship/subscription data — the Figma **"Your next autoship order"** block — comes from **Stay AI, not Inveterate**. (Inveterate = membership tier/credits only.)
- API base: `https://api.retextion.com/api/v2/` — e.g. `GET /subscriptions/?email={customer.email}&status=ACTIVE`. Requires a merchant API key = **private / server-side only** → no direct browser calls.
- Subscription statuses: `ACTIVE` / `PAUSED` / `CANCELLED`.

**Best-practice architecture (shared worker + Shopify App Proxy):**
```
Browser (Alpine fetch)  →  /apps/wb/*  →  Worker (holds API keys)  →  api.retextion.com/api/v2  (Stay AI)
  same-origin, no secrets   Shopify signs    verify HMAC signature +      public.inveterateapi.com  (Inveterate, only if needed)
  ← JSON ──────────────────────────────────  logged_in_customer_id  ← ──── data scoped to the member
```
- One App Proxy → one worker; routes: `/apps/wb/subscriptions` (Stay AI) and `/apps/wb/credits` (Inveterate credit history/redemption).
- Shopify signs the proxy request (HMAC `signature`) and injects `logged_in_customer_id` → worker resolves the member's email and scopes the Stay AI query to it. No secrets/tokens in the browser.
- Recommended host: **Cloudflare Worker** (or an existing Shopify app).

**"Your next autoship order" block — read + manage:**
- **Read (summary card):** worker → `GET /subscriptions` scoped to the member → render next order date, line items, qty, price, frequency, status per Figma.
- **Manage (edit / cancel / skip / swap / address):** two options —
  1. **Recommended:** route into **Stay AI's customer portal** (their theme app extension / app block, or deep-link) — Stay owns auth + mutations + edge cases (prepaid, dunning). Restyle per brief.
  2. **Fully custom inline** (only if Figma demands it): worker → Stay AI write endpoints. ⚠️ Confirm the write API surface first (public docs show `GET /subscriptions/` only); keep all mutations server-side + signature-verified.
- The dedicated **Stay.ai portal page** (§4.4) = embed Stay AI's full customer portal, restyled background (brief: "changed background color, everything else remains").

**Alternative (no runtime worker):** a webhook/cron mirrors subscription data into customer metafields; theme reads them in Liquid. Simplest storefront, accepts staleness + needs a sync pipeline; still can't do inline edit/cancel (that needs the portal or write API).

**Security non-negotiables:** API keys only in the worker env (never theme/settings/metafields/JS) · verify the App Proxy HMAC server-side · scope every query by the member's `logged_in_customer_id`/email · cache per-customer (rate limits undocumented).

### Credit history / redemption (Inveterate) — server-side layer
Source: **Inveterate Public API 2.0** (`https://public.inveterateapi.com/v2.0/`, header `X-Inveterate-Api-Key`) — same private/server-side key rule → via the **worker + App Proxy** (`GET /apps/wb/credits`), never from the browser.
- **Balance** — available natively (`customer.metafields.inveterate.credits_earned`); render in Liquid, no call needed.
- **History** (earned/redeemed entries) — from the Inveterate API via the worker (no metafield for it). ⚠️ Confirm the exact endpoint/field names in the API reference.
- **Redemption** — Inveterate mechanics. Confirm whether redemption is triggerable via the API (worker `POST`) or is checkout/autoship-only; wire `creditRedemption.ts` accordingly.
- Same secure exchange as subscriptions (signature + `logged_in_customer_id` + server-side scoping).

---

## 4. Screens — structure & responsive (mobile + desktop)

Breakpoint legend: **mobile** <750, **tablet** 750–1023 (`smd:`), **desktop** ≥1024 (`md:`).

### 4.1 Dashboard — `templates/customers/account.liquid` → `customer-account-dashboard`
Modules (order/visibility = schema blocks, finalized against Figma):
1. **Header/greeting** — `Hi {{ customer.first_name }}` + membership badge (`customer-membership-state`).
2. **Membership card** (`customer-membership-card`) — "Your membership tier" (Free/VIP/Elite, native) + "Progress to next tier" (progress bar from worker `GET /apps/wb/membership`) + CTA (Elite upsell for Free/VIP).
3. **Your next autoship order** (`customer-autoship-summary`) — the Figma block: shows the member's subscription(s) (next order date, line items, qty, price, frequency, status) + **all** subscriptions, with **edit / cancel** (and skip/swap/address). States: upcoming / cancelled / no-autoship. Data from **Stay AI** via worker + App Proxy (read); edit/cancel via Stay AI customer portal or worker write endpoints — see §3.
4. **Credits** (`customer-credits-badge`) — balance + link to credit history.
5. **Order history preview** (`customer-orders`, limit N) + "View all" link.

**Membership states (switch card content):**
- **Free** — `Free_NoAutoship` / `Free_CancelledAutoship`. Show "Start autoship" CTA and Elite upsell. If no autoship and no orders → show credits wider (`customer-credits-badge` full-width).
- **VIP** — `AccountDashboard_VIP`: autoship summary + credits + Elite upsell (Inveterate update flow).
- **Elite** — `AccountDashboard_Elite`: autoship summary + credits, no upsell (or "manage").
- **Special states:** Cancelled autoship (show only if no other active autoship orders); No autoship (credits wider).
- **Empty:** no orders → `customer-empty-state` (copy/CTA — AW to advise; block reserved).

**Layout:**
- **Desktop (`md:`)** — two columns: left nav/sidebar (`customer-account-nav`) + right content grid (`md:!grid-cols-2` for membership/autoship/credits cards, order preview full-width). `container mx-auto px-4`.
- **Tablet (`smd:`)** — single-column flow, nav on top (horizontal tabs), cards `smd:!grid-cols-2`.
- **Mobile** — vertical stack, nav as tab bar/accordion (`accountTabs.ts`), full-width cards, large targets, prominent credits badge.

### 4.2 Order page — `templates/customers/order.liquid` → `customer-order`
- Order header: `order.name`, date, status (`customer-order-status`).
- Line items (`order.line_items`): image (`picture`), title, variant, qty, price; subscription badge if `line_item.selling_plan_allocation`.
- Totals: subtotal/discounts/shipping/tax/total.
- Shipping/billing addresses, shipping method.
- **Tracking**: button (`wb-button`) to `fulfillment.tracking_url`.
- **Desktop** — 2 columns (items left, summary/addresses right `md:!sticky`). **Mobile** — stack, summary at bottom, accordions for addresses (`accordion`).

### 4.3 Membership credit history — `customer-credits`
- Large balance (`credits_earned_formatted`) + explanation (`member_tooltip`).
- **Redeem** block/button (`creditRedemption.ts`) — via Inveterate (worker `POST /apps/wb/credits/...` or checkout, TBD per API).
- **History** — table (desktop) / cards (mobile): date, type (earned/redeemed), amount, order. Data from **Inveterate API** via worker (`GET /apps/wb/credits`), see §3.
- History empty state.

### 4.4 Stay.ai portal page — `customer-stay-portal`
- Wrapper with a styled background per guide; inside — the Stay.ai app block/widget (their markup "as is").
- The section provides only the container + background + heading; Stay.ai owns the subscription logic. Responsive — their widget is responsive; our container `container`/padding per breakpoints.

### 4.5 Auth + Addresses (Shopify standard, styled)
- `login.liquid` — `form 'customer_login'` + recover password (`form 'recover_customer_password'`), toggled via Alpine.
- `register.liquid` — `form 'create_customer'`.
- `reset_password.liquid` — `form 'reset_customer_password'`.
- `activate_account.liquid` — `form 'activate_customer_password'`.
- `addresses.liquid` — `form 'customer_address'` (add/edit/delete), `{% paginate customer.addresses %}`, default address.
- Validation/errors via `form.errors` + `form.errors.translated_fields`. Centered card, `max-w-[...]`, full-width on mobile.

---

## 5. Responsive strategy (summary)
- **Mobile-first**: base classes = mobile; `smd:!`/`md:!` are overrides.
- Grids: `flex flex-col md:!flex-row`, `grid grid-cols-1 md:!grid-cols-2`.
- Container: `container mx-auto px-4` (as in existing sections).
- Account nav: desktop — sidebar/tabs; mobile — tab bar/accordion (`accountTabs.ts`), `x-cloak` until Alpine initializes.
- Typography — via `.h2/.h3/.body` (768px threshold baked in), don't hardcode sizes.
- Tables (orders/credits) → switch to cards on mobile (`hidden md:!table` / `md:!hidden` card view).
- Images — `picture` with responsive srcset.

---

## 6. Implementation order (phases)
Mapping to workstreams: **Phase 0 = Part A** (Shopify, native only). **Phase 1 = Part B** (Worker) + wiring Part A to the live contract. **Phase 2** = visual finalization per Figma. Part A can start immediately and mock the data contract.

**Phase 0 — scaffold (no external dependencies):**
1. `customer-membership-state.liquid` (refactor duplicated tier logic) + `customer-account-nav`.
2. `login/register/reset/activate/addresses` (native forms, styled).
3. `account.liquid` + `customer-account-dashboard` shell with Free/VIP/Elite states (membership card, credits badge; autoship/credits-history as placeholders with data contract).
4. `order.liquid` + `customer-order`, `customer-orders` (native `customer.orders`, tracking).
5. Elite upsell — reuse `membership-modal`/`modal.ts`.
6. Locales `customer.*`, Theme Check, responsive QA.

**Phase 1 — integrations (after backend answer):**
7. `customer-autoship-summary` — wire Stay.ai (widget/metafields/API).
8. `customer-stay-portal` — Stay.ai portal page.
9. `customer-credits` — redemption + history (Inveterate source).

**Phase 2 — visual finalization against Figma** (exact spacing/sizes/illustrations), animation polish, cross-device QA.

---

## 7. Critical files (read/reuse patterns)
- `layout/theme.liquid` — shell, `content_for_layout`, header/footer groups.
- `snippets/membership-widget.liquid` — tier + credits (source of logic for `customer-membership-state`).
- `snippets/membership-modal.liquid` — Elite upsell (`settings.elite_product`, `addToCart`).
- `snippets/header-actions.liquid` — account entry (`routes.account_url`, `shop.customer_accounts_enabled`).
- `snippets/{picture,wb-button,tooltip,accordion,icons}.liquid` — reusable primitives.
- `frontend/scripts/components/{modal,accordion,swiperSlider}.ts` + `frontend/entrypoints/main.js` — JS pattern.
- `frontend/styles/{colors,typography,components}.css`, `snippets/theme-styles-variables.liquid` — tokens/classes.
- `config/settings_schema.json` (color_schemes, Membership group), `sections/{header,footer}-group.json`.

---

## 8. Verification (end-to-end)
- Run: `npm run dev` (⚠️ starts `shopify theme dev` on a **dev theme**, not live) + Vite. Preview URL from CLI.
- Enable **classic customer accounts** in the dev-theme store settings (otherwise `routes.account_url` points to new accounts).
- Test accounts tagged for each tier (`inveterate-tier#...`) → verify Free/VIP/Elite states, no-autoship, cancelled, empty-orders.
- Verify: login/register/reset/activate/addresses (CRUD), order history + tracking link, order page, credits badge, Elite add-to-cart lands in cart with selling_plan.
- Responsive: mobile (375) / tablet (750) / desktop (≥1024) — layout, nav, tables→cards, targets, `x-cloak` with no FOUC.
- `shopify theme check` — no errors. A11y pass (keyboard, aria, contrast).
- **Do not push to live.** Demo only via the dev preview URL.

---

## 9. Open questions (needed before/during Phase 1)
1. **Figma frames** — access (connector) or exported desktop+mobile screenshots for pixel detail.
2. **Stay AI (Retextion) integration** — confirm: worker host (Cloudflare vs existing app), App Proxy subpath (`/apps/wb`), whether edit/cancel goes through Stay AI's customer portal (app block / deep-link) or their write API (confirm write endpoints exist), and merchant API key provisioning. (Decision in §3: read via worker+App Proxy, API key server-side only.)
3. **Credit history / redemption** — source confirmed = **Inveterate Public API 2.0** (via worker). Confirm exact endpoint/field names for history, and whether redemption is API-triggerable (worker `POST`) or checkout/autoship-only.
4. **Empty state** for order history — behavior (hide section vs blank state) — AW to advise.
5. Confirm the store uses **classic** customer accounts (not new).
6. **Missing Figma frames** (flag to AW): **credit-history page** and **addresses / activate-account** are not designed (only the dashboard credit card exists). Build to WB Style Guide + neighbouring screens until frames arrive. Figma pulled to `docs/figma/` (`ancillary/`, `account-portal/`) via `scripts/figma-pull.sh`.
