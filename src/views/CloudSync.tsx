import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { supabase, isCloudConfigured, useSession } from "../supabase";
import { syncNow, getLastSync } from "../sync";
import { useSettings } from "../settings";
import { IconSync } from "../icons";

type Status = { kind: "idle" | "busy" | "ok" | "error"; message?: string };

export default function CloudSync() {
  const { t, i18n } = useTranslation();
  const { settings } = useSettings();
  const { session, ready } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [lastSync, setLastSync] = useState<number | null>(getLastSync);

  if (!isCloudConfigured)
    return (
      <div className="settings-group">
        <strong>{t("cloud.title")}</strong>
        <p className="muted" style={{ padding: "4px 0 14px" }}>
          {t("cloud.notConfigured")}
        </p>
      </div>
    );

  const authenticate = async (mode: "in" | "up") => {
    if (!email.trim() || !password) return;
    setStatus({ kind: "busy" });
    const credentials = { email: email.trim(), password };
    const { data, error } =
      mode === "in"
        ? await supabase!.auth.signInWithPassword(credentials)
        : await supabase!.auth.signUp(credentials);
    if (error) {
      setStatus({ kind: "error", message: error.message });
      return;
    }
    setPassword("");
    if (mode === "up" && !data.session) {
      setStatus({ kind: "ok", message: t("cloud.checkEmail") });
      return;
    }
    setStatus({ kind: "idle" });
  };

  const runSync = async () => {
    setStatus({ kind: "busy", message: t("cloud.syncing") });
    try {
      const r = await syncNow(settings);
      setLastSync(getLastSync());
      setStatus({
        kind: "ok",
        message: t("cloud.syncDone", {
          pushed: r.pushed,
          pulled: r.pulled
        })
      });
    } catch (e) {
      setStatus({
        kind: "error",
        message: e instanceof Error ? e.message : String(e)
      });
    }
  };

  const signOut = async () => {
    await supabase!.auth.signOut();
    setStatus({ kind: "idle" });
  };

  const busy = status.kind === "busy";

  return (
    <div className="settings-group">
      <strong>{t("cloud.title")}</strong>

      {!ready && <p className="muted" style={{ padding: "4px 0 14px" }}>…</p>}

      {ready && !session && (
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            authenticate("in");
          }}
          style={{ padding: "4px 0 14px" }}
        >
          <p className="muted" style={{ marginBottom: 10 }}>
            {t("cloud.description")}
          </p>
          <div className="row">
            <input
              className="grow"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("cloud.email")}
            />
          </div>
          <div className="row">
            <input
              className="grow"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("cloud.password")}
            />
          </div>
          <div className="row" style={{ marginBottom: 0 }}>
            <button className="primary" type="submit" disabled={busy}>
              {t("cloud.signIn")}
            </button>
            <button type="button" disabled={busy} onClick={() => authenticate("up")}>
              {t("cloud.signUp")}
            </button>
          </div>
        </form>
      )}

      {ready && session && (
        <div style={{ padding: "4px 0 14px" }}>
          <p className="muted" style={{ marginBottom: 10 }}>
            {t("cloud.signedInAs", { email: session.user.email })}
          </p>
          <div className="row" style={{ marginBottom: 8 }}>
            <button className="primary" onClick={runSync} disabled={busy}>
              <IconSync size={15} /> {t("cloud.syncNow")}
            </button>
            <button onClick={signOut} disabled={busy}>
              {t("cloud.signOut")}
            </button>
          </div>
          <p className="muted">
            {lastSync
              ? t("cloud.lastSync", {
                  when: new Date(lastSync).toLocaleString(i18n.language)
                })
              : t("cloud.never")}
          </p>
        </div>
      )}

      {status.message && (
        <p
          className="muted"
          style={{
            padding: "0 0 12px",
            color: status.kind === "error" ? "var(--danger)" : undefined
          }}
        >
          {status.message}
        </p>
      )}
    </div>
  );
}
