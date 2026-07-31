# ShopSmart — execution plan for remaining phases

This plan was written by a stronger model to be executed phase-by-phase by a
lighter model. All architectural decisions are already made here — follow them
rather than re-deciding. If a step is genuinely impossible as written, stop and
tell the user what you found instead of substituting your own design.

## Project invariants — read before every phase

**Product rules**
- Free tools only. No paid APIs, no API keys for app features, no paid tiers.
- Performance budget: what matters is the **initial** bundle — what must arrive
  before first paint. Keep it under **160 kB gzipped** (currently ~124 kB).
  This is a guideline, not a hard requirement, but treat a jump of more than
  ~15 kB in one phase as a signal to code-split rather than absorb. Anything
  heavy (or anything only some users reach) gets `React.lazy`-split like
  `CloudSync` and `InsightsView`; async chunks are cheap and don't count
  against first paint. Check chunk sizes in `npm run build` output every phase,
  and say something if the initial bundle would meaningfully grow.
- UI taste (user was explicit): **no emoji anywhere in the UI**. Icons come
  from `src/icons.tsx` (24×24 stroke SVG, strokeWidth 1.75) — add new icons
  there in the same style. Warm neutral surfaces, one accent color via CSS
  variables, ghost buttons, hairline separators, uppercase micro-labels
  (`h3` style), tabular numerals for money. Minimalism over decoration.
- Every user-facing string goes through i18next with keys added to **all
  three** locale files: `src/locales/en.json`, `fr.json`, `es.json`.
  Plural keys use `_one` / `_other` (+ `_many` in fr/es).

**Code rules**
- Dexie booleans are `0 | 1` (IndexedDB can't index true booleans).
- Any Dexie schema change = a **new** `db.version(n).stores({...})` block in
  `src/db.ts` listing ALL tables. Never edit an existing version block.
- Item names are matched via `normalizeItemName()` (trim + lowercase) —
  always normalize before comparing or storing into `prices.itemName`.
- Sync invariants (`src/sync.ts`): every synced row carries `remoteId`;
  deletions must call `recordTombstone(table, remoteId)` inside the same
  Dexie transaction as the delete; sync order is tombstones → push/pull.
  If you add a synced table, follow the existing per-table pattern exactly.
- Money display: `settings.currency + value.toFixed(2)`.
- `.env` is gitignored and holds `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
  The anon key is public by design; the RLS policies are the security boundary.
  Never commit `.env`; never print tokens.

**Workflow rules (every phase)**
1. Build: `npm run build` must pass (it type-checks via `tsc -b`).
2. Verify in the browser: dev server config is `.claude/launch.json`
   (`shopsmart-dev`, port 5173). Use the Browser pane tools; check
   console for errors; screenshot when visual.
3. Run `npm test` once Phase 1 lands.
4. Commit with a descriptive message and push. On Windows/PowerShell,
   multi-line commit messages break — write the message to a scratchpad file
   and use `git commit -F <file>`, or use the Bash tool with a heredoc.
5. GitHub remote is `NoahScally-hub/Shopsmart`; pushes authenticate via the
   active `gh` account **NoahScally** (`gh auth switch` if it reverts).

**Environment facts**
- Windows 11, PowerShell 5.1 quirks apply (no `&&` chaining).
- MCP servers available in-session: `github` (local binary + PAT; if it fails
  with -32000, check `C:\Users\scall\AppData\Local\github-mcp-server\wrapper.log`
  — "TOKEN NOT SET" means the app needs a full quit/relaunch), `supabase`
  (remote OAuth, project ref `rlzpkfkxzajnloyfucwg`), `playwright`, `shadcn-ui`.
- Supabase MCP SQL (`execute_sql`) runs with elevated privileges and bypasses
  RLS — fine for maintenance, but never weaken RLS policies themselves.

---

## Phase 1 — Test harness + plan-math extraction

Goal: pure logic gets unit tests so later phases can't silently break it.

1. `npm i -D vitest` and add `"test": "vitest run"` to package.json scripts.
2. Create `src/plan.ts`: extract the plan computation out of
   `src/views/PlanView.tsx` into pure functions:
   - `travelCost(distanceKm, fuelLper100km, gasPricePerL): number`
   - `computeStorePlans(items, stores, priceMap, settings): StorePlan[]`
     (same filtering/sorting: coverage > 0, sort by missing asc then total asc)
   - `computeMultiStop(items, stores, priceMap, settings)` (cheapest store per
     item; travel counted once per visited store; null unless ≥2 stops)
   - `priceMap` stays `Map<"itemName|storeId", number>`.
3. Refactor `PlanView.tsx` to call these; behavior must be pixel-identical.
4. Tests in `src/__tests__/`:
   - `csv.test.ts`: `parseCsv` handles quotes/escaped quotes/CRLF;
     `itemsToCsv` → `csvToItems` round-trips; header row skipped; blank names
     dropped; qty defaults to 1.
   - `plan.test.ts`: travel cost formula (5 km, 8 L/100km, 1.60/L → 1.28);
     single-store ranking; multi-stop only when it uses ≥2 stores; excluded
     stores ignored; missing counts.
5. Full workflow rules (build, test, commit, push).

Acceptance: `npm test` green, `npm run build` green, Plan tab unchanged in
browser.

## Phase 2 — Sync polish + PWA installability

Goal: sync feels automatic; the PWA installs properly on phones.

1. Auto-sync: in `src/views/CloudSync.tsx` (or a small hook in
   `src/supabase.ts`), when a session exists on app load and
   `navigator.onLine`, run `syncNow(settings)` once (guard with a module-level
   flag so StrictMode double-mount doesn't double-sync; swallow errors into
   the existing status line). Keep the manual button.
2. Sync-state hint: show a small dot or "pending" count near the Sync button
   when local rows lack `remoteId` or tombstones exist (cheap `useLiveQuery`
   counts).
3. PWA icons: add `scripts/make-icons.mjs` using `sharp` (devDependency only)
   to render `public/icon.svg` → `public/icon-192.png`, `public/icon-512.png`
   (maskable, 20% safe padding on a `#047857` background). Reference both in
   the manifest in `vite.config.ts` (`purpose: "any maskable"`), keep the SVG
   too. Add `<link rel="apple-touch-icon" href="/icon-192.png">` to
   index.html. Run the script once, commit the PNGs; sharp never ships to the
   client bundle.
4. Acceptance: Chrome DevTools → Application → Manifest shows no
   installability warnings; auto-sync fires once on reload when signed in
   (verify via status text / network tab).

## Phase 3 — Price CSV + agent-assisted scraping pipeline

Goal: bulk price entry, and a documented workflow where a Claude session
scrapes store prices with the Playwright MCP and lands them in Supabase.

1. Prices CSV (in `PricesView`): Export button producing
   `item,store,price,on_sale` rows; Import button parsing the same format —
   unknown store names are created (distanceKm 0), rows upsert via the
   existing `[itemName+storeId]` path. Reuse `src/csv.ts` helpers; new i18n
   keys ×3.
2. Write `docs/SCRAPING.md` documenting the agent workflow (this is run BY a
   Claude session on user request — the app itself never scrapes):
   - Ask the user which store + which items (default: their default list).
   - Check the store website's robots.txt / ToS; if scraping is disallowed,
     tell the user and offer manual/flyer entry instead. Prefer public flyer
     pages. Be gentle: one page at a time, no crawling.
   - Use `mcp__playwright__browser_navigate` + `browser_snapshot` to read
     prices for the requested items only.
   - Land data path A (preferred, user signed in): via `mcp__supabase__execute_sql`
     look up the user's id (`select id from auth.users where email = '...'`,
     confirm the email with the user first), find-or-create the store row for
     that user, then upsert into `prices` with `source='scraped'`
     (`on conflict (user_id, store_id, item_name) do update`). The
     `price_history` trigger logs automatically. The app receives everything
     on next sync (stores are pulled before prices — order is handled).
   - Land data path B (user not signed in): produce a CSV in the Phase-3
     format and send it to the user to import.
3. Acceptance: round-trip a prices CSV through export→wipe→import in the
   browser; SCRAPING.md reviewed against the actual Playwright/Supabase tool
   names available in-session.

## Phase 4 — Insights tab

Goal: the "future insights" the relational DB was built for.

1. New feature toggle `insights` (default ON) in `src/settings.tsx`
   (`DEFAULTS.features`), Settings checkbox, tab in `App.tsx` gated like the
   others. New icon in `icons.tsx` (e.g. a simple trend line). i18n ×3.
2. `src/views/InsightsView.tsx`, local-data-only v1 (no network):
   - Monthly spend: sum of `trips.total` grouped by month, last 6 months.
   - Store ranking: trips count + total spent per store.
   - Sale ratio: share of tracked prices currently `onSale`.
   - Price trends v2 (only if signed in): lazy-fetch `price_history` via
     supabase-js inside the code-split chunk; per-item min/max/current.
3. Charts: **read the `dataviz` skill before writing any chart code.** No
   chart libraries — small inline SVG bar/line components in the existing
   minimal style (CSS-variable colors, no emoji, tabular numerals).
4. Empty states matter: with no trips yet, show a short hint pointing at the
   Plan tab's "I shopped here" button (i18n ×3).
5. Acceptance: build + tests green; toggle hides the tab entirely; view
   verified in browser in dark and light themes.

## Phase 5 — Recipe suggestions (the toggle already exists)

Goal: make the `recipes` feature toggle real, fully offline and free.

1. Dataset `src/data/recipes.json`, lazy-imported (code-split with the view):
   ~24 simple meals. Shape:
   `{ id, names: {en,fr,es}, ingredients: string[] (normalized en item names),
     steps: {en: string[], fr: string[], es: string[]} }`.
   Keep steps to 3-5 short lines each. Write decent translations, not
   machine-word-salad.
2. `src/views/RecipesView.tsx` (lazy like CloudSync): rank recipes by overlap
   between recipe ingredients and the default list's unchecked items
   (`normalizeItemName` on both sides); show match count ("uses 3 things on
   your list"), expandable steps, and a button to add a recipe's missing
   ingredients to the default list.
3. Tab gated on `settings.features.recipes` (leave default OFF as shipped);
   icon; i18n ×3.
4. Acceptance: toggling recipes on shows the tab; adding missing ingredients
   creates unchecked items on the default list; bundle budget respected
   (dataset must land in the lazy chunk — verify in build output).

## Phase 6 (stretch) — Real distances

Only do this if the user asks. Auto-fill store distance using free services,
respecting their usage policies (max 1 req/s, identify via User-Agent):
Nominatim search to geocode a store address typed by the user + browser
Geolocation API for home → haversine distance as the default `distanceKm`.
Do NOT add OSRM routing unless the user explicitly wants driving distances;
haversine is good enough for ranking nearby stores.

## Deploy gate — needs a user decision, ask once

GitHub Pages needs the repo public (free plan). When the user opts in:
1. They flip visibility (Settings → Danger Zone) — do not do it for them.
2. Add repo secrets `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
   (via github MCP or `gh secret set`) and pass them as `env` to the build
   step in `.github/workflows/deploy.yml` — without this the deployed build
   silently ships in local-only mode (`isCloudConfigured === false`).
3. Confirm Pages source is "GitHub Actions", push, verify the deployed URL
   on the Browser pane, and check the PWA installs from it.
If they want to stay private: Cloudflare Pages' free tier supports private
GitHub repos — propose it, don't set it up unsolicited.

## Explicitly out of scope (don't build)

- Push notifications (needs an always-on server; alerts stay in-app).
- Live/real-time gas price APIs (none are free+keyless; it's a setting).
- Background/continuous scraping (ToS + free-tier hostile; scraping stays
  agent-assisted and on-demand).
- Auth providers beyond email/password.
