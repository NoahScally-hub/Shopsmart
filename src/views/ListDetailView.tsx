import { useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useLiveQuery } from "dexie-react-hooks";
import db from "../db";
import { itemsToCsv, csvToItems, downloadFile } from "../csv";
import { useSpeech } from "../voice";
import { useSettings } from "../settings";

export default function ListDetailView({
  listId,
  onBack
}: {
  listId: number;
  onBack: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { settings } = useSettings();
  const list = useLiveQuery(() => db.lists.get(listId), [listId]);
  const items = useLiveQuery(
    () => db.items.where("listId").equals(listId).sortBy("createdAt"),
    [listId]
  );
  const [name, setName] = useState("");
  const [qty, setQty] = useState("1");
  const fileRef = useRef<HTMLInputElement>(null);
  const speech = useSpeech(i18n.language, (text) => setName(text));

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    await db.items.add({
      listId,
      name: n,
      qty: Number(qty) > 0 ? Number(qty) : 1,
      unit: "",
      checked: 0,
      createdAt: Date.now()
    });
    setName("");
    setQty("1");
  };

  const toggle = (id: number, checked: 0 | 1) =>
    db.items.update(id, { checked: checked ? 0 : 1 });

  const removeItem = (id: number) => db.items.delete(id);

  const clearChecked = () =>
    db.items.where("listId").equals(listId).and((i) => i.checked === 1).delete();

  const exportCsv = () =>
    downloadFile(`${(list?.name ?? "list").replace(/[^\w\- ]/g, "")}.csv`, itemsToCsv(items ?? []));

  const importCsv = async (file: File | undefined) => {
    if (!file) return;
    const rows = csvToItems(await file.text());
    if (rows.length) {
      const now = Date.now();
      await db.items.bulkAdd(rows.map((r, idx) => ({ ...r, listId, createdAt: now + idx })));
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <section>
      <div className="row spread">
        <button onClick={onBack}>← {t("common.back")}</button>
        <div className="row">
          <button onClick={exportCsv}>{t("items.exportCsv")}</button>
          <button onClick={() => fileRef.current?.click()}>{t("items.importCsv")}</button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: "none" }}
            onChange={(e) => importCsv(e.target.files?.[0])}
          />
        </div>
      </div>
      <h2>{list?.name}</h2>
      <form className="row" onSubmit={add}>
        <input
          className="grow"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("items.addPlaceholder")}
        />
        <input
          type="number"
          min="1"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          aria-label={t("common.qty")}
        />
        {settings.features.voice && speech.supported && (
          <button
            type="button"
            className={speech.listening ? "mic listening" : "mic"}
            title={speech.listening ? t("items.voiceStop") : t("items.voiceStart")}
            onClick={() => (speech.listening ? speech.stop() : speech.start())}
          >
            🎤
          </button>
        )}
        <button className="primary" type="submit">
          {t("common.add")}
        </button>
      </form>
      {items?.length === 0 && <p className="muted">{t("items.empty")}</p>}
      <ul className="cards">
        {items?.map((it) => (
          <li key={it.id} className={it.checked ? "card item-row done" : "card item-row"}>
            <input
              type="checkbox"
              checked={!!it.checked}
              onChange={() => toggle(it.id!, it.checked)}
            />
            <span className="name">
              {it.name}
              {it.qty > 1 ? <span className="muted"> ×{it.qty}</span> : null}
            </span>
            <button className="danger" onClick={() => removeItem(it.id!)}>
              ✕
            </button>
          </li>
        ))}
      </ul>
      {(items?.some((i) => i.checked) ?? false) && (
        <p>
          <button onClick={clearChecked}>{t("items.clearChecked")}</button>
        </p>
      )}
    </section>
  );
}
