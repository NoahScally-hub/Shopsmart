import { describe, expect, it } from "vitest";
import {
  buildAliasIndex,
  canonicalize,
  canonicalizeList,
  ingredientLabel,
  rankRecipes,
  type IngredientLexicon,
  type Recipe
} from "../recipes";
import lexiconJson from "../data/ingredients.json";
import recipesJson from "../data/recipes.json";

const lexicon = lexiconJson as IngredientLexicon;
const recipes = recipesJson as Recipe[];
const index = buildAliasIndex(lexicon);

const recipe = (id: string, ingredients: string[]): Recipe => ({
  id,
  names: { en: id, fr: id, es: id },
  ingredients,
  steps: { en: [], fr: [], es: [] }
});

describe("dataset integrity", () => {
  it("ships 24 recipes with unique ids", () => {
    expect(recipes).toHaveLength(24);
    expect(new Set(recipes.map((r) => r.id)).size).toBe(24);
  });

  it("only references ingredients that exist in the lexicon", () => {
    const unknown = recipes.flatMap((r) =>
      r.ingredients.filter((i) => !(i in lexicon)).map((i) => `${r.id}: ${i}`)
    );
    expect(unknown).toEqual([]);
  });

  it("has a name and at least three steps in every language", () => {
    for (const r of recipes) {
      for (const lang of ["en", "fr", "es"] as const) {
        expect(r.names[lang]?.length, `${r.id} name ${lang}`).toBeGreaterThan(0);
        expect(r.steps[lang]?.length, `${r.id} steps ${lang}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("gives every lexicon entry all three translations", () => {
    for (const [key, entry] of Object.entries(lexicon)) {
      expect(entry.en?.length, `${key}.en`).toBeGreaterThan(0);
      expect(entry.fr?.length, `${key}.fr`).toBeGreaterThan(0);
      expect(entry.es?.length, `${key}.es`).toBeGreaterThan(0);
    }
  });
});

describe("canonicalize", () => {
  it("matches the canonical English name", () => {
    expect(canonicalize("milk", index)).toBe("milk");
  });

  it("matches French and Spanish names", () => {
    expect(canonicalize("lait", index)).toBe("milk");
    expect(canonicalize("leche", index)).toBe("milk");
    expect(canonicalize("œufs", index)).toBe("eggs");
    expect(canonicalize("huevos", index)).toBe("eggs");
  });

  it("ignores case and surrounding whitespace", () => {
    expect(canonicalize("  MILK  ", index)).toBe("milk");
    expect(canonicalize("Poulet", index)).toBe("chicken");
  });

  it("matches known aliases and plurals", () => {
    expect(canonicalize("tomato", index)).toBe("tomatoes");
    expect(canonicalize("onions", index)).toBe("onion");
    expect(canonicalize("spaghetti", index)).toBe("pasta");
  });

  it("finds an ingredient inside a longer shopping-list entry", () => {
    expect(canonicalize("2% milk", index)).toBe("milk");
    expect(canonicalize("boneless chicken breast", index)).toBe("chicken");
  });

  it("prefers the longest match so coconut milk is not just milk", () => {
    expect(canonicalize("coconut milk", index)).toBe("coconut milk");
    expect(canonicalize("canned coconut milk", index)).toBe("coconut milk");
  });

  it("returns null for things it does not know", () => {
    expect(canonicalize("dishwasher tablets", index)).toBeNull();
    expect(canonicalize("   ", index)).toBeNull();
  });
});

describe("canonicalizeList", () => {
  it("collapses duplicates and drops unknown items", () => {
    const have = canonicalizeList(
      ["Milk", "2% milk", "lait", "batteries"],
      index
    );
    expect([...have]).toEqual(["milk"]);
  });
});

describe("rankRecipes", () => {
  const sample = [
    recipe("none", ["salmon", "lemon"]),
    recipe("two", ["eggs", "bread", "butter"]),
    recipe("one", ["eggs", "cheese"])
  ];

  it("puts the best-covered recipe first", () => {
    const ranked = rankRecipes(sample, new Set(["eggs", "bread"]), "en");
    expect(ranked.map((r) => r.recipe.id)).toEqual(["two", "one", "none"]);
  });

  it("splits ingredients into have and missing", () => {
    const ranked = rankRecipes(sample, new Set(["eggs", "bread"]), "en");
    expect(ranked[0].have).toEqual(["eggs", "bread"]);
    expect(ranked[0].missing).toEqual(["butter"]);
  });

  it("breaks ties toward the recipe needing fewer extras", () => {
    const ranked = rankRecipes(
      [recipe("long", ["eggs", "a", "b", "c"]), recipe("short", ["eggs", "a"])],
      new Set(["eggs"]),
      "en"
    );
    expect(ranked[0].recipe.id).toBe("short");
  });

  it("still returns every recipe when nothing matches", () => {
    const ranked = rankRecipes(sample, new Set(), "en");
    expect(ranked).toHaveLength(3);
    expect(ranked.every((r) => r.have.length === 0)).toBe(true);
  });

  it("ranks the real dataset from a realistic list", () => {
    const have = canonicalizeList(["eggs", "bread", "butter"], index);
    const ranked = rankRecipes(recipes, have, "en");
    expect(ranked[0].recipe.id).toBe("scrambled-eggs");
    expect(ranked[0].missing).toEqual([]);
  });
});

describe("ingredientLabel", () => {
  it("translates canonical keys for display", () => {
    expect(ingredientLabel("milk", lexicon, "fr")).toBe("lait");
    expect(ingredientLabel("milk", lexicon, "es")).toBe("leche");
  });

  it("falls back to the key when unknown", () => {
    expect(ingredientLabel("unobtainium", lexicon, "en")).toBe("unobtainium");
  });
});
