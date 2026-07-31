import { describe, expect, it } from "vitest";
import { csvToItems, itemsToCsv, parseCsv } from "../csv";
import type { ListItem } from "../types";

const item = (over: Partial<ListItem> = {}): ListItem => ({
  listId: 1,
  name: "Milk",
  qty: 1,
  unit: "",
  checked: 0,
  createdAt: 0,
  ...over
});

describe("parseCsv", () => {
  it("splits plain rows and fields", () => {
    expect(parseCsv("a,b\nc,d")).toEqual([
      ["a", "b"],
      ["c", "d"]
    ]);
  });

  it("treats CRLF as a single row break", () => {
    expect(parseCsv("a,b\r\nc,d")).toEqual([
      ["a", "b"],
      ["c", "d"]
    ]);
  });

  it("keeps commas and newlines inside quoted fields", () => {
    expect(parseCsv('"a,b",c')).toEqual([["a,b", "c"]]);
    expect(parseCsv('"line1\nline2",c')).toEqual([["line1\nline2", "c"]]);
  });

  it("unescapes doubled quotes", () => {
    expect(parseCsv('"say ""hi""",c')).toEqual([['say "hi"', "c"]]);
  });

  it("preserves empty trailing fields", () => {
    expect(parseCsv("a,,c")).toEqual([["a", "", "c"]]);
  });
});

describe("itemsToCsv", () => {
  it("writes a header and CRLF line endings", () => {
    const csv = itemsToCsv([item({ name: "Bread", qty: 2, unit: "kg" })]);
    expect(csv).toBe("name,qty,unit,checked\r\nBread,2,kg,0");
  });

  it("quotes fields containing commas or quotes", () => {
    const csv = itemsToCsv([item({ name: 'Rice, "long" grain' })]);
    expect(csv).toContain('"Rice, ""long"" grain"');
  });

  it("writes checked as 1", () => {
    expect(itemsToCsv([item({ checked: 1 })])).toContain("Milk,1,,1");
  });
});

describe("csvToItems", () => {
  it("skips the header row", () => {
    const rows = csvToItems("name,qty,unit,checked\r\nMilk,1,,0");
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Milk");
  });

  it("accepts data with no header", () => {
    expect(csvToItems("Milk,2,L,0")).toEqual([
      { name: "Milk", qty: 2, unit: "L", checked: 0 }
    ]);
  });

  it("drops rows with a blank name", () => {
    expect(csvToItems("name,qty,unit,checked\r\n,3,,0\r\nBread,1,,0")).toEqual([
      { name: "Bread", qty: 1, unit: "", checked: 0 }
    ]);
  });

  it("defaults qty to 1 when missing, zero or not a number", () => {
    expect(csvToItems("Milk").at(0)?.qty).toBe(1);
    expect(csvToItems("Milk,0,,0").at(0)?.qty).toBe(1);
    expect(csvToItems("Milk,abc,,0").at(0)?.qty).toBe(1);
  });

  it("reads checked from 1 or true, case-insensitively", () => {
    expect(csvToItems("Milk,1,,1").at(0)?.checked).toBe(1);
    expect(csvToItems("Milk,1,,TRUE").at(0)?.checked).toBe(1);
    expect(csvToItems("Milk,1,,0").at(0)?.checked).toBe(0);
  });

  it("trims names and tolerates a UTF-8 BOM", () => {
    expect(csvToItems("﻿name,qty,unit,checked\r\n  Milk  ,1,,0")).toEqual([
      { name: "Milk", qty: 1, unit: "", checked: 0 }
    ]);
  });

  it("returns nothing for empty input", () => {
    expect(csvToItems("")).toEqual([]);
    expect(csvToItems("   ")).toEqual([]);
  });

  it("round-trips items through export and import", () => {
    const original = [
      item({ name: 'Rice, "long" grain', qty: 2, unit: "kg", checked: 1 }),
      item({ name: "Café au lait", qty: 3, unit: "", checked: 0 })
    ];
    expect(csvToItems(itemsToCsv(original))).toEqual([
      { name: 'Rice, "long" grain', qty: 2, unit: "kg", checked: 1 },
      { name: "Café au lait", qty: 3, unit: "", checked: 0 }
    ]);
  });
});
