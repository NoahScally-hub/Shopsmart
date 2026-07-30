import type { ListItem } from "./types";

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
