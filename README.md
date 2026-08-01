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
| Insights: monthly spend, store ranking, sale share, price history | ✅ |
| Recipe suggestions ranked by what's on your list (off by default) | ✅ |
| Backup: export all data as JSON | ✅ |
| Supabase account + cloud sync across devices | ✅ |
| Scraped store prices via Playwright MCP | 🔜 |

## Roadmap

The remaining phases (tests, auto-sync + PWA polish, price scraping pipeline,
insights, recipes, distances, deploy) are specified in detail in
[docs/PLAN.md](docs/PLAN.md) — written to be executed phase-by-phase in future
sessions, including the project's invariants and guardrails.

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
3. Copy `.env.example` to `.env` and fill in `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY` (Project Settings → API Keys). The anon/publishable
   key is safe in client code — access is governed by the RLS policies, not by
   the key.

## Cloud sync

Settings → **Cloud sync**: create an account or sign in with an email and
password, then press **Sync now**. Sync is deliberately explicit (a button, not
a background daemon) so the app stays fast and predictable offline.

How it works (`src/sync.ts`):

- Every local row keeps a `remoteId` pointing at its Supabase row, so the two
  databases stay matched without changing the server schema.
- Sync **pulls first, then pushes only rows whose fields actually differ**, so
  repeat syncs cost one request per table instead of one per row.
- Deletions are recorded as **tombstones** and pushed before the pull, so a
  deleted list can't be resurrected by the next sync.
- Conflicts resolve last-write-wins per row. Preferences are pushed up (for the
  insights data) but never pulled down over your local settings.

`supabase-js` is ~60 kB gzipped, so it is **code-split** into its own chunk that
loads only when Settings opens — the initial app bundle stays ~122 kB gzipped.

## MCP servers (`.mcp.json`)

| Server | Purpose | Needs |
| --- | --- | --- |
| `github` (local binary) | Repo management, issues, PRs | Free — a fine-grained Personal Access Token (GitHub's OAuth server doesn't support the Dynamic Client Registration Claude Code's remote-MCP OAuth expects, so the local server + PAT is what actually works here) |
| `supabase` | Run migrations, query the relational DB | Free Supabase account; authenticates over OAuth via `claude /mcp` — no API key stored |
| `playwright` | Web scraping for store prices/flyers (free, local browser — chosen over AgentQL/Firecrawl which require API keys) | Nothing |
| `shadcn-ui` | UI component reference for design work | Nothing |

Restart Claude Code after editing `.mcp.json` and approve the servers when
prompted.

- **Supabase** is remote and uses OAuth: run `claude` in a **regular
  terminal** (not an IDE extension), then `/mcp`, select `supabase`, choose
  *Authenticate*.
- **GitHub** runs the official [github-mcp-server](https://github.com/github/github-mcp-server)
  binary locally (downloaded to `%LOCALAPPDATA%\github-mcp-server`),
  authenticated with a fine-grained Personal Access Token set as the
  `GITHUB_PERSONAL_ACCESS_TOKEN` environment variable — GitHub's OAuth server
  doesn't support Dynamic Client Registration, which Claude Code's remote-MCP
  OAuth flow requires, so the hosted `api.githubcopilot.com/mcp/` endpoint
  cannot complete a login from this or most non-Copilot MCP clients.

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
