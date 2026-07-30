// 0|1 instead of boolean because IndexedDB indexes can't contain booleans.
export interface ShoppingList {
  id?: number;
  name: string;
  isDefault: 0 | 1;
  createdAt: number;
}

export interface ListItem {
  id?: number;
  listId: number;
  name: string;
  qty: number;
  unit: string;
  checked: 0 | 1;
  createdAt: number;
}

export interface Store {
  id?: number;
  name: string;
  distanceKm: number;
}

export interface PriceEntry {
  id?: number;
  itemName: string; // normalized (trimmed, lowercased) so it matches across lists
  storeId: number;
  price: number;
  onSale: 0 | 1;
  updatedAt: number;
}

export interface Trip {
  id?: number;
  date: number;
  storeId: number;
  total: number;
  itemCount: number;
}
