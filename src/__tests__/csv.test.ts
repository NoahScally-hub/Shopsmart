import { describe, expect, it } from "vitest";
import {
  csvToItems,
  csvToPrices,
  itemsToCsv,
  parseCsv,
  pricesToCsv
} from "../csv";
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

  it("round-trips items through export and import (items)", () => {
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

describe("pricesToCsv", () => {
  it("writes a header and formats prices to two decimals", () => {
    const csv = pricesToCsv([
      { itemName: "milk", storeName: "Near", price: 3, onSale: 0 }
    ]);
    expect(csv).toBe("item,store,price,on_sale\r\nmilk,Near,3.00,0");
  });

  it("quotes store names containing commas", () => {
    const csv = pricesToCsv([
      { itemName: "milk", storeName: "Shop, The", price: 1.5, onSale: 1 }
    ]);
    expect(csv).toContain('"Shop, The",1.50,1');
  });
});

describe("csvToPrices", () => {
  it("skips the header and normalizes item names to lowercase", () => {
    expect(csvToPrices("item,store,price,on_sale\r\nMilk,Near,3.49,0")).toEqual([
      { itemName: "milk", storeName: "Near", price: 3.49, onSale: 0 }
    ]);
  });

  it("accepts data with no header row", () => {
    expect(csvToPrices("milk,Near,2,1")).toEqual([
      { itemName: "milk", storeName: "Near", price: 2, onSale: 1 }
    ]);
  });

  it("reads on_sale from 1, true or yes, case-insensitively", () => {
    expect(csvToPrices("milk,Near,2,TRUE").at(0)?.onSale).toBe(1);
    expect(csvToPrices("milk,Near,2,Yes").at(0)?.onSale).toBe(1);
    expect(csvToPrices("milk,Near,2,0").at(0)?.onSale).toBe(0);
    expect(csvToPrices("milk,Near,2,").at(0)?.onSale).toBe(0);
  });

  it("drops rows missing an item, a store, or a usable price", () => {
    const csv = [
      "item,store,price,on_sale",
      ",Near,3,0",
      "milk,,3,0",
      "milk,Near,,0",
      "milk,Near,abc,0",
      "milk,Near,0,0",
      "milk,Near,-2,0",
      "bread,Near,1.25,0"
    ].join("\r\n");
    expect(csvToPrices(csv)).toEqual([
      { itemName: "bread", storeName: "Near", price: 1.25, onSale: 0 }
    ]);
  });

  it("trims surrounding whitespace and tolerates a BOM", () => {
    expect(csvToPrices("﻿item,store,price,on_sale\r\n  Milk , Near ,3,0")).toEqual([
      { itemName: "milk", storeName: "Near", price: 3, onSale: 0 }
    ]);
  });

  it("returns nothing for empty input", () => {
    expect(csvToPrices("")).toEqual([]);
    expect(csvToPrices("   ")).toEqual([]);
  });

  it("round-trips prices through export and import", () => {
    const original = [
      { itemName: "milk", storeName: "Shop, The", price: 3.49, onSale: 1 },
      { itemName: "café", storeName: "Épicerie", price: 12.5, onSale: 0 }
    ] as const;
    expect(csvToPrices(pricesToCsv([...original]))).toEqual([...original]);
  });
});
