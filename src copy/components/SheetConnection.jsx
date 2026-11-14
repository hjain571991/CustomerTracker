import React, { useState } from "react";
import { AlertCircle, Check, Cloud, CloudOff, RefreshCw, Upload } from "lucide-react";
import { T, tint } from "../theme.js";
import { REQUIRED_SCRIPT_VERSION, isConfigured, ping } from "../lib/sheets.js";

/**
 * Connects the app to its Google Sheet.
 *
 * The URL is an Apps Script web app deployed from the sheet itself, which is
 * why there is no Google sign-in here: the script runs as whoever deployed it,
 * so the staff holding the phone never authenticate against anything.
 */
export default function SheetConnection({ config, onSave, sync, outboxCount, onRefresh, onUpload, counts }) {
  const [url, setUrl] = useState(config.url || "");
  const [secret, setSecret] = useState(config.secret || "");
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState(null);
  const [uploading, setUploading] = useState(null);

  const upload = async () => {
    const total = counts.customers + counts.actions + counts.reminders + counts.reps;
    if (!window.confirm(
      `Upload this device's ${counts.customers} customers, ${counts.actions} visits, ` +
        `${counts.reminders} reminders and ${counts.reps} representatives to the sheet?` +
        "\n\nAnything already in those four tabs is replaced."
    )) return;
    setResult(null);
    setUploading({ done: 0, total });
    try {
      let sent = 0;
      await onUpload(({ done }) => setUploading({ done: sent + done, total }));
      setResult({ ok: true, message: "Uploaded. The sheet now matches this device." });
    } catch (err) {
      setResult({ ok: false, message: err.message });
    } finally {
      setUploading(null);
    }
  };

  const connected = isConfigured(config);
  const dirty = url !== (config.url || "") || secret !== (config.secret || "");

  const field = {
    width: "100%",
    background: T.surfaceAlt,
    border: `1px solid ${T.border}`,
    borderRadius: 12,
    padding: "11px 12px",
    color: T.text,
    fontFamily: "'Roboto Mono', monospace",
    fontSize: 12,
    boxSizing: "border-box",
    marginBottom: 8,
  };

  const test = async (candidate) => {
    setTesting(true);
    setResult(null);
    try {
      const info = await ping(candidate);
      // Surfacing the version makes the "I pasted the code but nothing changed"
      // case obvious: an old number means the deployment was never republished.
      const version = Number(info?.version) || 1;
      setResult(
        version < REQUIRED_SCRIPT_VERSION
          ? {
              ok: false,
              message:
                `Connected, but the script is version ${version} and this app needs ${REQUIRED_SCRIPT_VERSION}. ` +
                "Company names, marketing reps and completed reminders will not reach the sheet until you paste " +
                "the latest google-apps-script/Code.gs in and redeploy as a New version.",
            }
          : { ok: true, message: `Connected. Script version ${version}.` }
      );
      return true;
    } catch (err) {
      setResult({ ok: false, message: err.message });
      return false;
    } finally {
      setTesting(false);
    }
  };

  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 16, padding: 16, marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        {connected ? <Cloud size={16} color={T.green} /> : <CloudOff size={16} color={T.textDim} />}
        <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 12, color: T.text }}>
          {connected ? "Connected to a Google Sheet" : "Not connected"}
        </span>
      </div>

      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.textDim, marginBottom: 12, lineHeight: 1.55 }}>
        {connected
          ? "Every tap is written to the sheet, and the app re-reads it whenever you come back to this screen."
          : "Paste the web app URL from the Apps Script deployment on your sheet. See google-apps-script/README.md for the five-minute setup."}
      </div>

      <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://script.google.com/…/exec" style={field} inputMode="url" autoComplete="off" />
      <input value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="Shared secret (optional)" style={field} autoComplete="off" />

      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={async () => {
            const candidate = { url: url.trim(), secret: secret.trim() };
            if (await test(candidate)) onSave(candidate);
          }}
          disabled={testing || (!dirty && connected)}
          style={{
            flex: 1,
            background: testing || (!dirty && connected) ? T.surfaceAlt : T.gold,
            color: testing || (!dirty && connected) ? T.textDim : T.onGold,
            border: "none",
            borderRadius: 12,
            padding: "11px 0",
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: 700,
            fontSize: 13,
            cursor: testing ? "wait" : "pointer",
          }}
        >
          {testing ? "Testing…" : dirty ? "Test & save" : "Saved"}
        </button>
        {connected && (
          <button
            onClick={onRefresh}
            style={{
              background: T.surfaceAlt,
              border: `1px solid ${T.border}`,
              borderRadius: 12,
              padding: "11px 14px",
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 700,
              fontSize: 12,
              color: T.text,
              cursor: "pointer",
            }}
          >
            <RefreshCw size={13} color={T.text} /> Sync
          </button>
        )}
      </div>

      {result && (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 10 }}>
          {result.ok ? <Check size={14} color={T.green} style={{ marginTop: 2, flexShrink: 0 }} />
                     : <AlertCircle size={14} color={T.red} style={{ marginTop: 2, flexShrink: 0 }} />}
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11.5, color: result.ok ? T.green : T.red, lineHeight: 1.5 }}>
            {result.message}
          </span>
        </div>
      )}

      {connected && (
        <button
          onClick={upload}
          disabled={Boolean(uploading)}
          style={{
            width: "100%",
            marginTop: 8,
            background: T.surfaceAlt,
            border: `1px solid ${T.border}`,
            borderRadius: 12,
            padding: "11px 0",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 7,
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: 700,
            fontSize: 12.5,
            color: uploading ? T.textDim : T.text,
            cursor: uploading ? "wait" : "pointer",
          }}
        >
          <Upload size={14} color={uploading ? T.textDim : T.text} />
          {uploading ? `Uploading ${uploading.done}/${uploading.total}…` : "Upload this device's data to the sheet"}
        </button>
      )}

      {sync.state === "empty" && (
        <div style={{ marginTop: 10, background: tint(T.amber, 0.12), border: `1px solid ${tint(T.amber, 0.3)}`, borderRadius: 12, padding: 12, display: "flex", gap: 9, alignItems: "flex-start" }}>
          <AlertCircle size={15} color={T.amber} style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11.5, color: T.text, lineHeight: 1.5 }}>
            The sheet is empty, so nothing was pulled down — this device's list is untouched. Use the upload button
            above to fill the sheet.
          </span>
        </div>
      )}

      {sync.scriptOutdated && (
        <div style={{ marginTop: 10, background: tint(T.amber, 0.12), border: `1px solid ${tint(T.amber, 0.3)}`, borderRadius: 12, padding: 12, display: "flex", gap: 9, alignItems: "flex-start" }}>
          <AlertCircle size={15} color={T.amber} style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11.5, color: T.text, lineHeight: 1.5 }}>
            This sheet has no <b>reps</b> tab, so its script is older than this app. Company names, marketing reps and
            completed reminders are <b>not</b> being saved to it. Paste the latest{" "}
            <code style={{ color: T.gold }}>google-apps-script/Code.gs</code> into Extensions → Apps Script, then
            Deploy → Manage deployments → ✏ → New version → Deploy.
          </span>
        </div>
      )}

      {connected && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${T.border}`, fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.textDim, lineHeight: 1.6 }}>
          <span style={{ display: "block", marginBottom: 4 }}>
            {sync.seeded
              ? "This sheet is the source of truth — changes go both ways."
              : "Not syncing yet: upload first, or the sheet needs data in it."}
          </span>
          {outboxCount > 0 ? (
            <span style={{ color: T.amber }}>
              {outboxCount} {outboxCount === 1 ? "change" : "changes"} waiting to go up — they will send on the next sync.
            </span>
          ) : (
            <span>Everything on this device has reached the sheet.</span>
          )}
          {sync.state === "error" && (
            <span style={{ display: "block", color: T.red, marginTop: 4 }}>Last sync failed: {sync.error}</span>
          )}
          {sync.state === "syncing" && <span style={{ display: "block", marginTop: 4 }}>Syncing…</span>}
          {sync.at && sync.state === "idle" && (
            <span style={{ display: "block", marginTop: 4 }}>
              Last synced {new Date(sync.at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
