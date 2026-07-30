import Dexie, { type EntityTable } from "dexie";
import type {
  ShoppingList,
  ListItem,
  Store,
  PriceEntry,
  Trip,
  Tombstone,
  SyncTable
} from "./types";

// Local-first relational store (IndexedDB). Mirrors supabase/migrations/0001_init.sql,
// which is the sync target once the user signs in (see sync.ts).
const db = new Dexie("shopsmart") as Dexie & {
  lists: EntityTable<ShoppingList, "id">;
  items: EntityTable<ListItem, "id">;
  stores: EntityTable<Store, "id">;
  prices: EntityTable<PriceEntry, "id">;
  trips: EntityTable<Trip, "id">;
  tombstones: EntityTable<Tombstone, "id">;
};

db.version(1).stores({
  lists: "++id, name, isDefault, createdAt",
  items: "++id, listId, name, checked",
  stores: "++id, name",
  prices: "++id, itemName, storeId, [itemName+storeId]",
  trips: "++id, date, storeId"
});

// v2 indexes remoteId so sync can map local rows to their Supabase counterparts,
// and adds tombstones so deletions propagate instead of being resurrected on pull.
db.version(2).stores({
  lists: "++id, name, isDefault, createdAt, remoteId",
  items: "++id, listId, name, checked, remoteId",
  stores: "++id, name, remoteId",
  prices: "++id, itemName, storeId, [itemName+storeId], remoteId",
  trips: "++id, date, storeId, remoteId",
  tombstones: "++id, table"
});

export const normalizeItemName = (s: string) => s.trim().toLowerCase();

/** Remember that an already-synced row was deleted, so the next sync deletes it
 *  in Supabase too. Rows never pushed to the cloud need no tombstone. */
export async function recordTombstone(
  table: SyncTable,
  remoteId: number | undefined
) {
  if (remoteId == null) return;
  await db.tombstones.add({ table, remoteId });
}

export default db;
