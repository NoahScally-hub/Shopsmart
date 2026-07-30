import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useLiveQuery } from "dexie-react-hooks";
import db from "../db";
import { IconStar, IconTrash } from "../icons";
import ListDetailView from "./ListDetailView";

export default function ListsView() {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const lists = useLiveQuery(() => db.lists.orderBy("createdAt").toArray(), []);
  const counts = useLiveQuery(async () => {
    const items = await db.items.toArray();
    const m = new Map<number, number>();
    for (const it of items) m.set(it.listId, (m.get(it.listId) ?? 0) + 1);
    return m;
  }, []);

  if (selectedId != null)
    return (
      <ListDetailView listId={selectedId} onBack={() => setSelectedId(null)} />
    );

  const addList = async (e: FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    const isFirst = (lists?.length ?? 0) === 0;
    await db.lists.add({ name: n, isDefault: isFirst ? 1 : 0, createdAt: Date.now() });
    setName("");
  };

  const makeDefault = async (id: number) => {
    await db.transaction("rw", db.lists, async () => {
      await db.lists.toCollection().modify({ isDefault: 0 });
      await db.lists.update(id, { isDefault: 1 });
    });
  };

  const remove = async (id: number, listName: string) => {
    if (!confirm(t("lists.deleteConfirm", { name: listName }))) return;
    await db.transaction("rw", db.lists, db.items, async () => {
      await db.items.where("listId").equals(id).delete();
      await db.lists.delete(id);
    });
  };

  return (
    <section>
      <h2>{t("lists.title")}</h2>
      <form className="row" onSubmit={addList}>
        <input
          className="grow"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("lists.newListPlaceholder")}
        />
        <button className="primary" type="submit">
          {t("common.add")}
        </button>
      </form>
      {lists?.length === 0 && <p className="muted">{t("lists.empty")}</p>}
      <ul className="cards">
        {lists?.map((l) => (
          <li key={l.id} className="card row spread">
            <button className="linklike grow" onClick={() => setSelectedId(l.id!)}>
              <strong>{l.name}</strong>
              {l.isDefault ? <span className="pill">{t("lists.defaultBadge")}</span> : null}
              <div className="muted">
                {t("lists.itemsCount", { count: counts?.get(l.id!) ?? 0 })}
              </div>
            </button>
            {!l.isDefault && (
              <button
                className="ghost"
                title={t("lists.makeDefault")}
                aria-label={t("lists.makeDefault")}
                onClick={() => makeDefault(l.id!)}
              >
                <IconStar size={17} />
              </button>
            )}
            <button
              className="ghost danger"
              title={t("common.delete")}
              aria-label={t("common.delete")}
              onClick={() => remove(l.id!, l.name)}
            >
              <IconTrash size={17} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
