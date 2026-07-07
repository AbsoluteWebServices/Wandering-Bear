# Wandering Bear — Shopify Theme

## 🌐 LANGUAGE RULE: ENGLISH ONLY
Everything we write is in **English** — code, comments, commit messages, branch names, PR descriptions, docs, Liquid/section schema labels, locale values, variable/class/file names, and any written output. No exceptions.

## ⛔ MAIN RULE: NEVER PUSH TO LIVE
- **Forbidden:** `shopify theme push`, `shopify theme publish`, `npm run deploy`, `pnpm deploy` — blocked in `.claude/settings.local.json`.
- Development & preview — **only** via `shopify theme dev` (local server, does not touch the published theme) or a manual push to a separate **unpublished** dev theme (not via Claude).
- Work in a git branch/worktree. Do not merge into `main` without explicit approval.

## Stack
- Shopify Online Store 2.0 (JSON templates, sections/blocks).
- Build: **Vite 8** + `vite-plugin-shopify`. Assets build into `assets/`, entrypoints in `frontend/entrypoints/`.
- Styles: **Tailwind CSS v4** (`@tailwindcss/vite`) + custom CSS in `frontend/styles/`.
- JS: **Alpine.js** (+ `@alpinejs/morph`), **Swiper**. TS components in `frontend/scripts/components/`.
- Dev: `npm run dev` (`shopify theme dev --theme-editor-sync` + `vite:dev`).
- Store: `wandering-bear.myshopify.com`.

## Membership / Subscriptions
Two systems, don't conflate:
- **Inveterate** — membership tiers and credits (NOT Stay.ai, though the brief calls it "Stay.ai").
  - Tier is derived from `customer.tags`:
    - `inveterate-tier#c4057f2f` → **FREE**
    - `inveterate-tier#72ccf378` → **VIP**
    - `inveterate-tier#dc38b982` → **ELITE**
    - `inveterate-tier#99a431e2` → **ELITE**
  - Credits **balance**: `customer.metafields.inveterate.credits_earned` (money filters) — native Liquid.
  - Credit **history + redemption**: **Inveterate Public API 2.0** (`https://public.inveterateapi.com/v2.0/`, header `X-Inveterate-Api-Key`) via the worker + App Proxy (`/apps/wb/credits`). Key server-side only.
  - Elite product/selling plan: `settings.elite_product`.
- **Subscriptions / autoship** — the client's app is **Stay AI (Retextion, `app.retextion.com`)**, installed on Shopify. Data via the **Stay AI API** (`https://api.retextion.com/api/v2/`, `GET /subscriptions/?email=…&status=ACTIVE|PAUSED|CANCELLED`). Merchant API key is **private / server-side only** → call via a **worker behind a Shopify App Proxy** (`/apps/wb/*`), never from theme JS. The Figma **"Your next autoship order"** block shows subscriptions + **edit/cancel** (prefer routing edits into Stay AI's customer portal). Inveterate API is NOT the subscription source. See `docs/account-portal-plan.md` §3.

Existing components (reuse the patterns):
- `snippets/membership-widget.liquid`, `snippets/membership-modal.liquid`
- `sections/membership.liquid`, `sections/aw-member-comparison.liquid`, `sections/aw-membership-modal.liquid`

## Task: Account Portal (My Account)
Build a custom account portal per Figma. Full build plan: `docs/account-portal-plan.md`.

### Decisions made
- **Account system: Classic customer accounts (Liquid).** Implemented via `templates/customers/*.liquid` + custom `sections`/`snippets`. Reuse existing membership components and natively read `customer` / `customer.tags` / `customer.metafields.inveterate.*`.
  - ✅ **Store setting = Legacy (verified in Admin, 2026-07):** `Settings → Customer accounts` shows "You're using legacy customer accounts". Do NOT click "Upgrade now".
  - ⚠️ **The THEME is still flagged NEW accounts** because it has no `templates/customers/*` yet → Shopify shows *"Publishing this theme will upgrade you to the new version of customer accounts"* on the draft themes. **There is no theme toggle** — adding the classic customer templates (`templates/customers/*`, our Task 01+) is what "downgrades" the theme to classic. Until those exist: **do NOT Publish any theme** (publishing upgrades the whole store to new accounts) and do NOT click "Upgrade now".
  - Preview via GitHub-connected **draft** themes per branch (e.g. `Wandering-Bear/feat/account-portal`) — never Publish. (`git push` the branch → Shopify creates the draft theme; this is not `shopify theme push`.)
  - ⚠️ Base theme was originally built for **NEW** accounts (`snippets/header-actions.liquid` has `<shopify-account>` web-component styles + `menu="{{ customer_account_menu }}"`), so the mode must actually be switched/verified in Admin — it is **not** detectable from Liquid (`shop.customer_accounts_enabled` is `true` for both modes).
- **Figma:** https://www.figma.com/design/IaDINDvZYnKMfT8nprQZUy/WB-x-AW-Account-Portal?node-id=0-1&m=dev&t=OM3waSKZSUn65uJQ-1

### Classic customer account screens (Liquid templates to create)
- `templates/customers/account.liquid` — Dashboard (main portal screen)
- `templates/customers/order.liquid` — Order page
- `templates/customers/login.liquid`, `register.liquid`, `reset_password.liquid`, `activate_account.liquid`, `addresses.liquid` — standard, styled to the guide
- Membership credit history + Stay.ai portal — likely custom sections inside account.liquid or separate customer templates (finalize against Figma)

### Still open
1. **Figma frames:** direct file read is unavailable without Figma MCP auth (WebFetch returns no design data due to auth). Need either the Figma connector or exported screenshots/spec.
2. **Stay.ai API** — how we pull upcoming order / autoship (app proxy? customer metafields? client-side JS?). Confirm backend constraints.
3. Empty state for the orders section when there are no orders (AW to advise).
