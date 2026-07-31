import type { ListItem } from "./types";

/** A price row as it appears in a CSV: the store is named, not an id, so the
 *  file stays portable between devices and readable by hand. */
export interface PriceCsvRow {
  itemName: string;
  storeName: string;
  price: number;
  onSale: 0 | 1;
}

function esc(v: string | number): string {
  const s = String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function itemsToCsv(items: ListItem[]): string {
  const header = "name,qty,unit,checked";
  const rows = items.map((i) =>
    [esc(i.name), i.qty, esc(i.unit), i.checked ? 1 : 0].join(",")
  );
  return [header, ...rows].join("\r\n");
}

export function downloadFile(
  filename: string,
  content: string,
  mime = "text/csv;charset=utf-8"
) {
  // BOM so Excel opens UTF-8 (accents in fr/es item names) correctly
  const blob = new Blob(["﻿" + content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function pricesToCsv(rows: PriceCsvRow[]): string {
  const header = "item,store,price,on_sale";
  const body = rows.map((r) =>
    [esc(r.itemName), esc(r.storeName), r.price.toFixed(2), r.onSale ? 1 : 0].join(",")
  );
  return [header, ...body].join("\r\n");
}

export function csvToPrices(text: string): PriceCsvRow[] {
  const rows = parseCsv(text.replace(/^﻿/, "").trim());
  if (!rows.length) return [];
  const start = rows[0][0]?.trim().toLowerCase() === "item" ? 1 : 0;
  const out: PriceCsvRow[] = [];
  for (let r = start; r < rows.length; r++) {
    const [item, store, price, onSale] = rows[r];
    const itemName = item?.trim().toLowerCase() ?? "";
    const storeName = store?.trim() ?? "";
    const value = Number(price);
    // A price row is meaningless without all three, and a non-positive price
    // would corrupt plan totals — skip rather than guess.
    if (!itemName || !storeName || !Number.isFinite(value) || value <= 0) continue;
    const sale = onSale?.trim().toLowerCase();
    out.push({
      itemName,
      storeName,
      price: value,
      onSale: sale === "1" || sale === "true" || sale === "yes" ? 1 : 0
    });
  }
  return out;
}

export function csvToItems(
  text: string
): Array<Pick<ListItem, "name" | "qty" | "unit" | "checked">> {
  const rows = parseCsv(text.replace(/^﻿/, "").trim());
  if (!rows.length) return [];
  const start = rows[0][0]?.trim().toLowerCase() === "name" ? 1 : 0;
  const out: Array<Pick<ListItem, "name" | "qty" | "unit" | "checked">> = [];
  for (let r = start; r < rows.length; r++) {
    const [name, qty, unit, checked] = rows[r];
    if (!name?.trim()) continue;
    out.push({
      name: name.trim(),
      qty: Number(qty) > 0 ? Number(qty) : 1,
      unit: unit?.trim() ?? "",
      checked: checked === "1" || checked?.toLowerCase() === "true" ? 1 : 0
    });
  }
  return out;
}
