-- ShopSmart relational schema (Supabase / PostgreSQL)
-- Mirrors the local-first Dexie (IndexedDB) schema in src/db.ts.
-- Every table is scoped to a user and protected by Row Level Security,
-- so the free-tier project can safely serve multiple users.

-- ---------------------------------------------------------------------------
-- User preferences (1 row per auth user)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  language text not null default 'en' check (language in ('en', 'fr', 'es')),
  theme text not null default 'system' check (theme in ('system', 'light', 'dark')),
  accent text not null default 'green',
  features jsonb not null default '{"prices":true,"plan":true,"alerts":true,"voice":true,"recipes":false}'::jsonb,
  gas_price_per_l numeric(6, 3) not null default 1.6,
  fuel_l_per_100km numeric(5, 2) not null default 8,
  currency text not null default '$',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Shopping lists and their items
-- ---------------------------------------------------------------------------
create table public.lists (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create index lists_user_idx on public.lists (user_id);

create table public.items (
  id bigint generated always as identity primary key,
  list_id bigint not null references public.lists (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  qty numeric(8, 2) not null default 1,
  unit text not null default '',
  checked boolean not null default false,
  created_at timestamptz not null default now()
);
create index items_list_idx on public.items (list_id);
create index items_user_idx on public.items (user_id);

-- ---------------------------------------------------------------------------
-- Stores and observed prices (the cross-reference data)
-- ---------------------------------------------------------------------------
create table public.stores (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  distance_km numeric(6, 1) not null default 0,
  created_at timestamptz not null default now()
);
create index stores_user_idx on public.stores (user_id);

create table public.prices (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  store_id bigint not null references public.stores (id) on delete cascade,
  item_name text not null, -- normalized: trimmed + lowercased
  price numeric(10, 2) not null check (price >= 0),
  on_sale boolean not null default false,
  source text not null default 'manual', -- manual | scraped | imported
  observed_at timestamptz not null default now(),
  unique (user_id, store_id, item_name)
);
create index prices_user_item_idx on public.prices (user_id, item_name);

-- Price history for future insights (every observation, not just latest).
create table public.price_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  store_id bigint not null references public.stores (id) on delete cascade,
  item_name text not null,
  price numeric(10, 2) not null,
  on_sale boolean not null default false,
  observed_at timestamptz not null default now()
);
create index price_history_user_item_idx on public.price_history (user_id, item_name, observed_at);

-- ---------------------------------------------------------------------------
-- Shopping history (recorded trips) for insights
-- ---------------------------------------------------------------------------
create table public.trips (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  store_id bigint not null references public.stores (id) on delete cascade,
  shopped_at timestamptz not null default now(),
  total numeric(10, 2) not null default 0,
  item_count int not null default 0
);
create index trips_user_idx on public.trips (user_id, shopped_at);

-- ---------------------------------------------------------------------------
-- Row Level Security: each user sees only their own rows
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.lists enable row level security;
alter table public.items enable row level security;
alter table public.stores enable row level security;
alter table public.prices enable row level security;
alter table public.price_history enable row level security;
alter table public.trips enable row level security;

create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "own lists" on public.lists
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own items" on public.items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own stores" on public.stores
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own prices" on public.prices
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own price_history" on public.price_history
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own trips" on public.trips
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Keep prices.observed_at / price_history in sync automatically.
create or replace function public.log_price_history()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into price_history (user_id, store_id, item_name, price, on_sale, observed_at)
  values (new.user_id, new.store_id, new.item_name, new.price, new.on_sale, new.observed_at);
  return new;
end;
$$;

create trigger prices_history_trigger
  after insert or update on public.prices
  for each row execute function public.log_price_history();
