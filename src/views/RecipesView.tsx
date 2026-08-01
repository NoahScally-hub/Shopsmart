import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLiveQuery } from "dexie-react-hooks";
import db from "../db";
import { useSettings } from "../settings";
import {
  buildAliasIndex,
  canonicalizeList,
  ingredientLabel,
  rankRecipes,
  type IngredientLexicon,
  type Recipe
} from "../recipes";
import lexiconJson from "../data/ingredients.json";
import recipesJson from "../data/recipes.json";

const lexicon = lexiconJson as IngredientLexicon;
const allRecipes = recipesJson as Recipe[];

const INITIAL_SHOWN = 8;

export default function RecipesView() {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const language = settings.language;
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [message, setMessage] = useState("");

  const lists = useLiveQuery(() => db.lists.toArray(), []);
  const targetList = lists?.find((l) => l.isDefault) ?? lists?.[0] ?? null;
  const items = useLiveQuery(
    async () =>
      targetList?.id == null
        ? []
        : (await db.items.where("listId").equals(targetList.id).toArray()).filter(
            (i) => !i.checked
          ),
    [targetList?.id]
  );

  const index = useMemo(() => buildAliasIndex(lexicon), []);
  const ranked = useMemo(() => {
    const have = canonicalizeList((items ?? []).map((i) => i.name), index);
    return rankRecipes(allRecipes, have, language);
  }, [items, index, language]);

  if (!lists || !items) return null;

  const addMissing = async (recipeId: string, missing: string[]) => {
    if (!targetList?.id || !missing.length) return;
    const now = Date.now();
    await db.items.bulkAdd(
      missing.map((canonical, i) => ({
        listId: targetList.id!,
        name: ingredientLabel(canonical, lexicon, language),
        qty: 1,
        unit: "",
        checked: 0 as const,
        createdAt: now + i
      }))
    );
    setMessage(
      t("recipes.added", { count: missing.length, list: targetList.name })
    );
    setTimeout(() => setMessage(""), 4000);
    void recipeId;
  };

  const shown = showAll ? ranked : ranked.slice(0, INITIAL_SHOWN);

  return (
    <section>
      <h2>{t("recipes.title")}</h2>

      {!targetList ? (
        <p className="muted">{t("recipes.noList")}</p>
      ) : (
        <>
          <p className="muted" style={{ marginBottom: 12 }}>
            {t("recipes.basedOn", { list: targetList.name })}
          </p>
          {message && <p className="pill">{message}</p>}

          <ul className="cards">
            {shown.map(({ recipe, have, missing }) => (
              <li key={recipe.id} className={have.length ? "card best" : "card"}>
                <div className="row spread" style={{ marginBottom: 6 }}>
                  <strong>{recipe.names[language]}</strong>
                  {have.length > 0 && (
                    <span className="pill">
                      {t("recipes.usesCount", { count: have.length })}
                    </span>
                  )}
                </div>

                <div className="chips">
                  {recipe.ingredients.map((ing) => (
                    <span
                      key={ing}
                      className={have.includes(ing) ? "chip has" : "chip"}
                    >
                      {ingredientLabel(ing, lexicon, language)}
                    </span>
                  ))}
                </div>

                <div className="row" style={{ marginTop: 10, marginBottom: 0 }}>
                  <button
                    onClick={() =>
                      setExpanded(expanded === recipe.id ? null : recipe.id)
                    }
                  >
                    {expanded === recipe.id
                      ? t("recipes.hideSteps")
                      : t("recipes.showSteps")}
                  </button>
                  {missing.length > 0 ? (
                    <button
                      className="primary"
                      onClick={() => addMissing(recipe.id, missing)}
                    >
                      {t("recipes.addMissing", { count: missing.length })}
                    </button>
                  ) : (
                    <span className="muted">{t("recipes.nothingMissing")}</span>
                  )}
                </div>

                {expanded === recipe.id && (
                  <ol className="steps">
                    {recipe.steps[language].map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ol>
                )}
              </li>
            ))}
          </ul>

          {!showAll && ranked.length > INITIAL_SHOWN && (
            <p>
              <button onClick={() => setShowAll(true)}>
                {t("recipes.showMore", { count: ranked.length - INITIAL_SHOWN })}
              </button>
            </p>
          )}
        </>
      )}
    </section>
  );
}
