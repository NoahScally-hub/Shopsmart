// 0|1 instead of boolean because IndexedDB indexes can't contain booleans.
// remoteId is the primary key of the matching row in Supabase; absent until
// the row has been pushed to the cloud at least once.

export interface ShoppingList {
  id?: number;
  remoteId?: number;
  name: string;
  isDefault: 0 | 1;
  createdAt: number;
}

export interface ListItem {
  id?: number;
  remoteId?: number;
  listId: number;
  name: string;
  qty: number;
  unit: string;
  checked: 0 | 1;
  createdAt: number;
}

export interface Store {
  id?: number;
  remoteId?: number;
  name: string;
  distanceKm: number;
  /** Set when the distance was derived from a looked-up address. Local only —
   *  distanceKm is what syncs, since the Supabase stores table has no
   *  coordinate columns. */
  address?: string;
  lat?: number;
  lon?: number;
}

export interface PriceEntry {
  id?: number;
  remoteId?: number;
  itemName: string; // normalized (trimmed, lowercased) so it matches across lists
  storeId: number;
  price: number;
  onSale: 0 | 1;
  updatedAt: number;
}

export interface Trip {
  id?: number;
  remoteId?: number;
  date: number;
  storeId: number;
  total: number;
  itemCount: number;
}

export type SyncTable = "lists" | "items" | "stores" | "prices" | "trips";

export interface Tombstone {
  id?: number;
  table: SyncTable;
  remoteId: number;
}
