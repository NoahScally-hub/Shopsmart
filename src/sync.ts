import db from "./db";
import { supabase } from "./supabase";
import type { Settings } from "./settings";
import type { SyncTable } from "./types";

export interface SyncResult {
  pushed: number;
  pulled: number;
  deleted: number;
}

const LAST_SYNC_KEY = "shopsmart-last-sync";

export const getLastSync = (): number | null => {
  const raw = localStorage.getItem(LAST_SYNC_KEY);
  return raw ? Number(raw) : null;
};

/** Run `fn` over `items` with bounded concurrency so a large sync doesn't fire
 *  hundreds of simultaneous requests. */
async function mapLimit<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>
) {
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (cursor < items.length) {
        await fn(items[cursor++]);
      }
    }
  );
  await Promise.all(workers);
}

const num = (v: unknown) => Number(v ?? 0);

interface RemoteRow {
  id: number;
  [key: string]: unknown;
}

export async function syncNow(settings: Settings): Promise<SyncResult> {
  if (!supabase) throw new Error("cloud-not-configured");
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not-signed-in");
  const userId = user.id;

  let pushed = 0;
  let pulled = 0;
  let deleted = 0;

  const fail = (e: { message: string } | null) => {
    if (e) throw new Error(e.message);
  };

  // ---- 1. Propagate local deletions first, so pull can't resurrect them ----
  const tombstones = await db.tombstones.toArray();
  if (tombstones.length) {
    const byTable = new Map<SyncTable, number[]>();
    for (const t of tombstones) {
      const list = byTable.get(t.table) ?? [];
      list.push(t.remoteId);
      byTable.set(t.table, list);
    }
    for (const [table, ids] of byTable) {
      const { error } = await supabase.from(table).delete().in("id", ids);
      fail(error);
      deleted += ids.length;
    }
    await db.tombstones.clear();
  }

  // ---- 2. Preferences ----
  fail(
    (
      await supabase.from("profiles").upsert({
        id: userId,
        language: settings.language,
        theme: settings.theme,
        accent: settings.accent,
        features: settings.features,
        gas_price_per_l: settings.gasPricePerL,
        fuel_l_per_100km: settings.fuelLper100km,
        currency: settings.currency,
        updated_at: new Date().toISOString()
      })
    ).error
  );

  // ---- 3. Stores ----
  const { data: remoteStores, error: storeErr } = await supabase
    .from("stores")
    .select("*");
  fail(storeErr);
  const localStores = await db.stores.toArray();
  const remoteStoreById = new Map(
    (remoteStores ?? []).map((r) => [r.id as number, r as RemoteRow])
  );
  /** local store id -> remote store id */
  const storeRemote = new Map<number, number>();

  const newStores = localStores.filter((s) => s.remoteId == null);
  if (newStores.length) {
    const { data, error } = await supabase
      .from("stores")
      .insert(
        newStores.map((s) => ({
          user_id: userId,
          name: s.name,
          distance_km: s.distanceKm
        }))
      )
      .select("id");
    fail(error);
    for (let i = 0; i < newStores.length; i++) {
      const remoteId = (data ?? [])[i]?.id as number | undefined;
      if (remoteId == null) continue;
      await db.stores.update(newStores[i].id!, { remoteId });
      storeRemote.set(newStores[i].id!, remoteId);
      pushed++;
    }
  }

  const changedStores = localStores.filter((s) => {
    if (s.remoteId == null) return false;
    storeRemote.set(s.id!, s.remoteId);
    const r = remoteStoreById.get(s.remoteId);
    return r && (r.name !== s.name || num(r.distance_km) !== s.distanceKm);
  });
  await mapLimit(changedStores, 6, async (s) => {
    const { error } = await supabase!
      .from("stores")
      .update({ name: s.name, distance_km: s.distanceKm })
      .eq("id", s.remoteId!);
    fail(error);
    pushed++;
  });

  const knownStoreRemotes = new Set(storeRemote.values());
  for (const r of remoteStores ?? []) {
    if (knownStoreRemotes.has(r.id)) continue;
    const localId = (await db.stores.add({
      name: String(r.name),
      distanceKm: num(r.distance_km),
      remoteId: r.id
    })) as number;
    storeRemote.set(localId, r.id);
    pulled++;
  }
  const storeLocalByRemote = new Map(
    [...storeRemote].map(([local, remote]) => [remote, local])
  );

  // ---- 4. Lists ----
  const { data: remoteLists, error: listErr } = await supabase
    .from("lists")
    .select("*");
  fail(listErr);
  const localLists = await db.lists.toArray();
  const remoteListById = new Map(
    (remoteLists ?? []).map((r) => [r.id as number, r as RemoteRow])
  );
  const listRemote = new Map<number, number>();

  const newLists = localLists.filter((l) => l.remoteId == null);
  if (newLists.length) {
    const { data, error } = await supabase
      .from("lists")
      .insert(
        newLists.map((l) => ({
          user_id: userId,
          name: l.name,
          is_default: l.isDefault === 1,
          created_at: new Date(l.createdAt).toISOString()
        }))
      )
      .select("id");
    fail(error);
    for (let i = 0; i < newLists.length; i++) {
      const remoteId = (data ?? [])[i]?.id as number | undefined;
      if (remoteId == null) continue;
      await db.lists.update(newLists[i].id!, { remoteId });
      listRemote.set(newLists[i].id!, remoteId);
      pushed++;
    }
  }

  const changedLists = localLists.filter((l) => {
    if (l.remoteId == null) return false;
    listRemote.set(l.id!, l.remoteId);
    const r = remoteListById.get(l.remoteId);
    return r && (r.name !== l.name || r.is_default !== (l.isDefault === 1));
  });
  await mapLimit(changedLists, 6, async (l) => {
    const { error } = await supabase!
      .from("lists")
      .update({ name: l.name, is_default: l.isDefault === 1 })
      .eq("id", l.remoteId!);
    fail(error);
    pushed++;
  });

  const knownListRemotes = new Set(listRemote.values());
  for (const r of remoteLists ?? []) {
    if (knownListRemotes.has(r.id)) continue;
    const localId = (await db.lists.add({
      name: String(r.name),
      isDefault: r.is_default ? 1 : 0,
      createdAt: new Date(String(r.created_at)).getTime(),
      remoteId: r.id
    })) as number;
    listRemote.set(localId, r.id);
    pulled++;
  }
  const listLocalByRemote = new Map(
    [...listRemote].map(([local, remote]) => [remote, local])
  );

  // ---- 5. Items ----
  const { data: remoteItems, error: itemErr } = await supabase
    .from("items")
    .select("*");
  fail(itemErr);
  const localItems = await db.items.toArray();
  const remoteItemById = new Map(
    (remoteItems ?? []).map((r) => [r.id as number, r as RemoteRow])
  );
  const itemRemotes = new Set<number>();

  const newItems = localItems.filter(
    (i) => i.remoteId == null && listRemote.has(i.listId)
  );
  if (newItems.length) {
    const { data, error } = await supabase
      .from("items")
      .insert(
        newItems.map((i) => ({
          user_id: userId,
          list_id: listRemote.get(i.listId)!,
          name: i.name,
          qty: i.qty,
          unit: i.unit,
          checked: i.checked === 1,
          created_at: new Date(i.createdAt).toISOString()
        }))
      )
      .select("id");
    fail(error);
    for (let i = 0; i < newItems.length; i++) {
      const remoteId = (data ?? [])[i]?.id as number | undefined;
      if (remoteId == null) continue;
      await db.items.update(newItems[i].id!, { remoteId });
      itemRemotes.add(remoteId);
      pushed++;
    }
  }

  const changedItems = localItems.filter((i) => {
    if (i.remoteId == null) return false;
    itemRemotes.add(i.remoteId);
    const r = remoteItemById.get(i.remoteId);
    return (
      r &&
      (r.name !== i.name ||
        num(r.qty) !== i.qty ||
        r.unit !== i.unit ||
        r.checked !== (i.checked === 1))
    );
  });
  await mapLimit(changedItems, 6, async (i) => {
    const { error } = await supabase!
      .from("items")
      .update({
        name: i.name,
        qty: i.qty,
        unit: i.unit,
        checked: i.checked === 1
      })
      .eq("id", i.remoteId!);
    fail(error);
    pushed++;
  });

  for (const r of remoteItems ?? []) {
    if (itemRemotes.has(r.id)) continue;
    const localListId = listLocalByRemote.get(r.list_id as number);
    if (localListId == null) continue;
    await db.items.add({
      listId: localListId,
      name: String(r.name),
      qty: num(r.qty),
      unit: String(r.unit ?? ""),
      checked: r.checked ? 1 : 0,
      createdAt: new Date(String(r.created_at)).getTime(),
      remoteId: r.id
    });
    pulled++;
  }

  // ---- 6. Prices ----
  const { data: remotePrices, error: priceErr } = await supabase
    .from("prices")
    .select("*");
  fail(priceErr);
  const localPrices = await db.prices.toArray();
  const remotePriceById = new Map(
    (remotePrices ?? []).map((r) => [r.id as number, r as RemoteRow])
  );
  const priceRemotes = new Set<number>();

  const newPrices = localPrices.filter(
    (p) => p.remoteId == null && storeRemote.has(p.storeId)
  );
  if (newPrices.length) {
    // (user_id, store_id, item_name) is unique, so a row already pushed from
    // another device is updated rather than rejected.
    const { data, error } = await supabase
      .from("prices")
      .upsert(
        newPrices.map((p) => ({
          user_id: userId,
          store_id: storeRemote.get(p.storeId)!,
          item_name: p.itemName,
          price: p.price,
          on_sale: p.onSale === 1,
          observed_at: new Date(p.updatedAt).toISOString()
        })),
        { onConflict: "user_id,store_id,item_name" }
      )
      .select("id");
    fail(error);
    for (let i = 0; i < newPrices.length; i++) {
      const remoteId = (data ?? [])[i]?.id as number | undefined;
      if (remoteId == null) continue;
      await db.prices.update(newPrices[i].id!, { remoteId });
      priceRemotes.add(remoteId);
      pushed++;
    }
  }

  const changedPrices = localPrices.filter((p) => {
    if (p.remoteId == null) return false;
    priceRemotes.add(p.remoteId);
    const r = remotePriceById.get(p.remoteId);
    return r && (num(r.price) !== p.price || r.on_sale !== (p.onSale === 1));
  });
  await mapLimit(changedPrices, 6, async (p) => {
    const { error } = await supabase!
      .from("prices")
      .update({
        price: p.price,
        on_sale: p.onSale === 1,
        observed_at: new Date(p.updatedAt).toISOString()
      })
      .eq("id", p.remoteId!);
    fail(error);
    pushed++;
  });

  for (const r of remotePrices ?? []) {
    if (priceRemotes.has(r.id)) continue;
    const localStoreId = storeLocalByRemote.get(r.store_id as number);
    if (localStoreId == null) continue;
    await db.prices.add({
      itemName: String(r.item_name),
      storeId: localStoreId,
      price: num(r.price),
      onSale: r.on_sale ? 1 : 0,
      updatedAt: new Date(String(r.observed_at)).getTime(),
      remoteId: r.id
    });
    pulled++;
  }

  // ---- 7. Trips ----
  const { data: remoteTrips, error: tripErr } = await supabase
    .from("trips")
    .select("*");
  fail(tripErr);
  const localTrips = await db.trips.toArray();
  const tripRemotes = new Set<number>();

  const newTrips = localTrips.filter(
    (t) => t.remoteId == null && storeRemote.has(t.storeId)
  );
  if (newTrips.length) {
    const { data, error } = await supabase
      .from("trips")
      .insert(
        newTrips.map((t) => ({
          user_id: userId,
          store_id: storeRemote.get(t.storeId)!,
          shopped_at: new Date(t.date).toISOString(),
          total: t.total,
          item_count: t.itemCount
        }))
      )
      .select("id");
    fail(error);
    for (let i = 0; i < newTrips.length; i++) {
      const remoteId = (data ?? [])[i]?.id as number | undefined;
      if (remoteId == null) continue;
      await db.trips.update(newTrips[i].id!, { remoteId });
      tripRemotes.add(remoteId);
      pushed++;
    }
  }
  for (const t of localTrips) if (t.remoteId != null) tripRemotes.add(t.remoteId);

  for (const r of remoteTrips ?? []) {
    if (tripRemotes.has(r.id)) continue;
    const localStoreId = storeLocalByRemote.get(r.store_id as number);
    if (localStoreId == null) continue;
    await db.trips.add({
      date: new Date(String(r.shopped_at)).getTime(),
      storeId: localStoreId,
      total: num(r.total),
      itemCount: num(r.item_count),
      remoteId: r.id
    });
    pulled++;
  }

  localStorage.setItem(LAST_SYNC_KEY, String(Date.now()));
  return { pushed, pulled, deleted };
}
