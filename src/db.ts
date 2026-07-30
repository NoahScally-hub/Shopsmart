import Dexie, { type EntityTable } from "dexie";
import type { ShoppingList, ListItem, Store, PriceEntry, Trip } from "./types";

// Local-first relational store (IndexedDB). Mirrors supabase/migrations/0001_init.sql,
// which becomes the sync target once a Supabase project is connected.
const db = new Dexie("shopsmart") as Dexie & {
  lists: EntityTable<ShoppingList, "id">;
  items: EntityTable<ListItem, "id">;
  stores: EntityTable<Store, "id">;
  prices: EntityTable<PriceEntry, "id">;
  trips: EntityTable<Trip, "id">;
};

db.version(1).stores({
  lists: "++id, name, isDefault, createdAt",
  items: "++id, listId, name, checked",
  stores: "++id, name",
  prices: "++id, itemName, storeId, [itemName+storeId]",
  trips: "++id, date, storeId"
});

export const normalizeItemName = (s: string) => s.trim().toLowerCase();

export default db;
