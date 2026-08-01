import { normalizeItemName } from "./db";
import type { Language } from "./settings";

export interface IngredientEntry {
  en: string;
  fr: string;
  es: string;
  aliases: string[];
}

export type IngredientLexicon = Record<string, IngredientEntry>;

export interface Recipe {
  id: string;
  names: Record<Language, string>;
  ingredients: string[];
  steps: Record<Language, string[]>;
}

export interface RankedRecipe {
  recipe: Recipe;
  /** Canonical ingredient keys already on the list. */
  have: string[];
  /** Canonical ingredient keys still needed. */
  missing: string[];
}

/** Maps every spelling we know — canonical key, each translation, and any
 *  alias — onto the canonical key, so a list written in any of the three
 *  languages still matches the English-keyed recipe data. */
export function buildAliasIndex(lexicon: IngredientLexicon): Map<string, string> {
  const index = new Map<string, string>();
  for (const [canonical, entry] of Object.entries(lexicon)) {
    const spellings = [canonical, entry.en, entry.fr, entry.es, ...entry.aliases];
    for (const spelling of spellings) {
      const key = normalizeItemName(spelling);
      if (key) index.set(key, canonical);
    }
  }
  return index;
}

/** Resolve a free-text shopping-list entry to a canonical ingredient.
 *  Falls back to substring matching so "2% milk" or "chicken breast" still
 *  resolve, preferring the longest alias so "coconut milk" beats "milk". */
export function canonicalize(
  rawName: string,
  index: Map<string, string>
): string | null {
  const name = normalizeItemName(rawName);
  if (!name) return null;
  const exact = index.get(name);
  if (exact) return exact;

  let best: string | null = null;
  let bestLength = 0;
  for (const [alias, canonical] of index) {
    if (alias.length > bestLength && name.includes(alias)) {
      best = canonical;
      bestLength = alias.length;
    }
  }
  return best;
}

/** Canonical ingredients the user already has, from raw list item names. */
export function canonicalizeList(
  itemNames: string[],
  index: Map<string, string>
): Set<string> {
  const have = new Set<string>();
  for (const name of itemNames) {
    const canonical = canonicalize(name, index);
    if (canonical) have.add(canonical);
  }
  return have;
}

/** Recipes ordered by how much of them the list already covers. Ties break
 *  toward the recipe needing fewest extra ingredients, then by name, so the
 *  order is stable rather than dependent on dataset order. */
export function rankRecipes(
  recipes: Recipe[],
  have: Set<string>,
  language: Language
): RankedRecipe[] {
  return recipes
    .map((recipe) => {
      const hits: string[] = [];
      const missing: string[] = [];
      for (const ingredient of recipe.ingredients) {
        if (have.has(ingredient)) hits.push(ingredient);
        else missing.push(ingredient);
      }
      return { recipe, have: hits, missing };
    })
    .sort(
      (a, b) =>
        b.have.length - a.have.length ||
        a.missing.length - b.missing.length ||
        a.recipe.names[language].localeCompare(b.recipe.names[language])
    );
}

/** Display name for a canonical ingredient in the active language. */
export function ingredientLabel(
  canonical: string,
  lexicon: IngredientLexicon,
  language: Language
): string {
  return lexicon[canonical]?.[language] ?? canonical;
}
