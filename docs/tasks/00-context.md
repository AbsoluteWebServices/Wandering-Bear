# Account Portal — Shared Context (read before any task)

Full spec = `../account-portal-plan.md` + repo `CLAUDE.md`. This file is the condensed shared context every task references.

## Goal
Build a custom **Account Portal / My Account** for the Wandering Bear Shopify theme, per Figma (`WB-x-AW-Account-Portal`), on **Legacy (classic) customer accounts (Liquid)**. Senior Shopify frontend, Shopify standards, responsive (mobile + desktop).

## ⛔ Golden rules
- **English only.** All code, comments, commits, branch names, docs, schema labels, locale values, and identifiers are in English. No exceptions.
- **Never push to live.** Dev only via `shopify theme dev` (unpublished dev theme). Push/publish/deploy are blocked in `.claude/settings.local.json`.
- **Never expose API keys client-side.** Third-party data (Inveterate/Stay AI) goes through the worker only.
- **Source of truth** for this project = `CLAUDE.md` + `../account-portal-plan.md` (this session owns them).

## Stack
Shopify OS 2.0 · Liquid · Vite 8 (`vite-plugin-shopify`) · Tailwind v4 (CSS `@theme`) · Alpine.js (lazy, interaction-gated) · Swiper. Dev: `npm run dev`.

## Integrations (3 pillars)
| Pillar | Tool | Native or worker |
|---|---|---|
| Account, orders, addresses | Shopify Legacy accounts | **Native Liquid** (`customer`, `customer.orders`, `order.*`) |
| Membership tier + credits **balance** | **Inveterate** | **Native Liquid** (`customer.tags` `inveterate-tier#…`, `customer.metafields.inveterate.credits_earned`) |
| Progress-to-next-tier, credit history/redemption | **Inveterate API** | **Worker** `/apps/wb/membership`, `/apps/wb/credits` |
| Subscriptions / autoship, edit/cancel | **Stay AI (Retextion)** | **Worker** `/apps/wb/subscriptions` + Stay AI customer portal |

Inveterate tier codes: `c4057f2f`=FREE · `72ccf378`=VIP · `dc38b982`/`99a431e2`=ELITE.

## Worker = Part B (secure exchange)
One Cloudflare Worker behind one Shopify App Proxy (`/apps/wb/*`). Keys server-side only. Every request: verify App Proxy HMAC `signature` → trust `logged_in_customer_id` only → scope query server-side → minimized JSON response. Frontend consumes via same-origin `fetch('/apps/wb/…')` and **mocks the contract until the worker ships**.

## Conventions (mandatory)
- **Legacy accounts:** ⚠️ base theme ships NEW-accounts markup (`snippets/header-actions.liquid`); mode must be switched to Legacy in Admin → Settings → Customer accounts (not detectable from Liquid). Confirmed by client.
- **Sections-first:** screen content in `sections/*.liquid` with `{% schema %}`; `templates/customers/*.liquid` = thin `{% section %}` wrapper.
- **AW styling:** Tailwind `!` / `md:!` modifiers, typo classes `.h1–.h5/.body`, inline `{{ color_scheme.settings.* }}`, brand vars (`--color-espresso/-gold/...`).
- **Reuse snippets:** `picture`, `wb-button`, `tooltip`, `accordion`, `icons`, `membership-widget`.
- **JS:** Alpine plugins in `frontend/scripts/components/*.ts` + register in `frontend/entrypoints/main.js`. `x-cloak` to avoid FOUC.
- **Text via locales** (`locales/en.default.json`, `customer.*`). Money via money filters.
  - ⚠️ **Gotcha:** the `t` filter is NOT evaluated inside `{% render %}` arguments (renders the raw key). Assign the translated string to a variable in a `{% liquid %}` block first, then pass the variable: `assign t_x = 'key' | t` → `render 'snip', label: t_x`.
- **Breakpoints (mobile-first):** mobile <750 · tablet `smd:` 750 · desktop `md:` ≥1024.
- **A11y** (semantic, aria, focus, ≥44px targets) + **Theme Check** clean.
- **Forms:** native `{% form %}`; `customer_address` needs a param (`customer.new_address`/`address`); order statuses via `order.financial_status_label`/`fulfillment_status_label`; activate/reset only via email token.

## Figma reference & Design QA (run after every task)
Frames are pulled to `docs/figma/<file>/`:
- **`ancillary/`** — file `XKBQXkFlhpPQHn5xx97qjC` (WB x AW Ancillary Pages): **Login, New Account, Reset Password** (+ error/confirmation + `_Mobile`).
- **`account-portal/`** — file `IaDINDvZYnKMfT8nprQZUy` (WB x AW Account Portal): **AccountDashboard_VIP / _Elite / _Free_NoAutoship / _Free_CancelledAutoship**, and **Other Account Pages** (order / credit history / Stay portal).
- Each folder: `frames.md` (index with node-ids), `exports/*.png` (renders), `file.json` (raw nodes for exact tokens).
- Re-pull: `./scripts/figma-pull.sh` with env `FIGMA_FILE_KEY` / `FIGMA_SUBDIR` / `FIGMA_SCALE` (token in `.figma-token`, gitignored). Exact token/spacing for a node: `GET /v1/nodes?ids=<node-id>` or read `file.json`.

**Design-QA procedure — do this before marking any task done:**
1. Open the exact frame(s) for the task — **desktop + mobile + every state variant** (default / error / empty / confirmation).
2. `shopify theme dev` → view the built screen at the frame's breakpoints (desktop, and mobile 375); screenshot.
3. **Side-by-side vs the export:** layout & order, spacing/margins, type scale, colors, radii, borders/shadows, icons, imagery — and every state.
4. **Pull exact tokens from Figma** (hex, font-size, line-height, letter-spacing, spacing, radius) from the node (`file.json` / `GET /v1/nodes`) → map to theme vars / `.h*` / `.body`. Don't eyeball.
5. Responsive re-check at **375 / 750 / 1024**; a11y; `shopify theme check`.
6. **Parity sign-off:** matches desktop + mobile, all state frames covered, tokens match, no FOUC.

## Task index
| # | Task | File | Part | Depends on |
|---|---|---|---|---|
| 01 | Auth + initial Dashboard (login, register, forgot/reset pw, dashboard scaffold) | `01-auth-and-dashboard.md` | A | Legacy accounts on |
| 02 | Dashboard states + Membership card (Free/VIP/Elite, tier + progress, credits badge) | `02-dashboard-membership.md` | A | 01, (worker mock) |
| 03 | Order history + Order page (native, tracking) | `03-orders.md` | A | 01 |
| 04 | "Your next autoship order" (Stay AI) + portal page | `04-subscriptions.md` | A | worker/mock |
| 05 | Credit history + redemption (Inveterate) | `05-credits.md` | A | worker/mock |
| 06 | Addresses | `06-addresses.md` | A | 01 |
| 07 | Worker + App Proxy (membership/subscriptions/credits, secure) | `07-worker.md` | B | Shopify app |
| 08 | Locales / Theme Check / a11y / responsive QA | `08-qa.md` | A | all |

Build order: **01 first.** 02/03/06 can follow in parallel; 04/05 need the worker (or mocks); 07 is the Part B track; 08 is the final pass.
