# 🛒 ShopSmart

Smart shopping lists with price comparison, cost-optimized trip planning, sale
alerts, voice dictation and full en/fr/es localization — as one codebase that
runs on the web **and** installs on your phone.

## Why a PWA (and not a native app)?

ShopSmart is a **Progressive Web App** built with React + TypeScript + Vite:

- **One codebase, every device** — responsive layout (bottom tab bar on phones,
  top bar on desktop) and installable from the browser via *Add to Home
  Screen* on Android/iOS. No app-store accounts needed (Apple charges $99/yr,
  Google $25 — not "free tools").
- **Local-first = fast** — all data lives in IndexedDB (via Dexie) on your
  device. Every tap is instant and the app works fully offline. The bundle is
  ~120 KB gzipped.
- **Free voice dictation** — the browser's built-in Web Speech API
  (Chrome/Edge/Safari; the mic button hides itself on unsupported browsers).
- **Free hosting** — GitHub Pages, deployed automatically by GitHub Actions on
  every push to `main`.
- **Relational insights DB** — the same schema exists as a Supabase
  (PostgreSQL) project for sync + future insights: `supabase/migrations/0001_init.sql`.

## Features

| Feature | Status |
| --- | --- |
| Shopping lists (default list, multiple lists) | ✅ |
| CSV export & import per list | ✅ |
| Store price cross-reference table (cheapest highlighted) | ✅ |
| Shopping plan: item cost + gas/distance travel cost, single-store & multi-stop, user-adjustable | ✅ |
| Sale alerts (badge + alerts tab) for items on your lists | ✅ |
| English / Français / Español | ✅ |
| Voice dictation for adding items | ✅ |
| Themes (light/dark/system + 4 accent colors) | ✅ |
| Feature toggles — hidden features remove their tab entirely | ✅ |
| Backup: export all data as JSON | ✅ |
| Supabase sync + multi-device | 🔜 (schema ready, needs your Supabase project) |
| Scraped store prices via Playwright MCP | 🔜 |
| Recipe suggestions | 🔜 (toggle already in Settings, off by default) |

## Development

```bash
npm install
npm run dev      # dev server on http://localhost:5173
npm run build    # type-check + production build in dist/
```

## How the shopping plan works

For each store you haven't excluded:

```
travel cost = distance km × 2 (round trip) ÷ 100 × car consumption (L/100km) × gas price/L
estimated total = Σ (known item price × qty) + travel cost
```

Gas price, consumption and currency are in **Settings**. A **multi-stop plan**
is also computed (each item at its cheapest store, travel counted per stop).
Stores can be excluded with one tap to adjust the plan. Recorded trips are kept
in the `trips` table for future insights.

> **Note on live data:** real-time gas prices and live store price feeds have
> no free, key-less APIs. Instead, gas price is a setting you control, prices
> are recorded manually (or via CSV import), and on-demand scraping through the
> free Playwright MCP is the next planned step. See *Feasibility notes* below.

## Relational database (Supabase, free tier)

`supabase/migrations/0001_init.sql` contains the full schema: `profiles`
(preferences), `lists`, `items`, `stores`, `prices` (+ `price_history` filled
by trigger, for insights), `trips` — all with Row Level Security.

To activate it:

1. Create a free project at [supabase.com](https://supabase.com).
2. Run the migration in the SQL editor (or via the Supabase MCP below).
3. Create a personal access token (Account → Access Tokens) and set the
   `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF` environment variables so
   the MCP server can manage the project.

## MCP servers (`.mcp.json`)

| Server | Purpose | Needs |
| --- | --- | --- |
| `github` (remote, OAuth) | Repo management, issues, PRs | OAuth sign-in via `/mcp`, free |
| `supabase` | Run migrations, query the relational DB | Free Supabase account + access token |
| `playwright` | Web scraping for store prices/flyers (free, local browser — chosen over AgentQL/Firecrawl which require API keys) | Nothing |
| `shadcn-ui` | UI component reference for design work | Nothing |

Restart Claude Code after editing `.mcp.json`; approve the servers when
prompted, and run `/mcp` to complete the GitHub OAuth sign-in.

## Feasibility notes (free-tier constraints)

- **Real-time gas prices**: no free key-less API exists (GasBuddy et al. are
  partner-only). Scoped to a user-set gas price in Settings — accurate enough
  for comparing stores a few km apart.
- **Live store pricing at scale**: continuously scraping every store is not
  feasible on free tiers (and many store sites prohibit it). Scoped to manual
  price capture + CSV import now; on-demand, per-item scraping of stores that
  allow it via the local Playwright MCP is planned next.
- **Push notifications for sales**: real push needs a always-on server; the
  free approach used here is in-app alerts (badge + Alerts tab) computed
  locally, which also works offline.
- **Route optimization**: true multi-stop routing needs a routing API with
  keys; the plan uses straight round-trip distances you enter per store, which
  is transparent and predictable. Can be upgraded to OSRM's free demo server
  later.
