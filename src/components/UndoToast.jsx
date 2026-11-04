import React from "react";
import { Check, Undo2 } from "lucide-react";
import { T, tint } from "../theme.js";

/**
 * Confirms what was just logged and offers a way back.
 *
 * `pending` is a stack, newest last. Mis-taps on a wall of faces arrive in
 * bursts, so Undo steps back one at a time and the count ticks down — never an
 * "undo everything", which would throw away the taps that were deliberate.
 *
 * `notice` covers the tap that changed nothing (already logged that day). It
 * carries no Undo of its own, because there is nothing to take back.
 */
export default function UndoToast({ pending = [], notice, onUndo, bottomOffset = 20 }) {
  const depth = pending.length;
  if (!depth && !notice) return null;

  const last = pending[depth - 1];
  // A no-op tap only speaks up when it is the whole story; mid-burst the
  // count stays on screen and the card's own flash confirms the tap landed.
  const showNotice = notice && depth === 0;

  const message = showNotice ? (
    <>
      <b style={{ fontWeight: 700 }}>{notice.name}</b> was already logged for that day
    </>
  ) : depth === 1 ? (
    <>
      <b style={{ fontWeight: 700 }}>{last.name}</b> logged
    </>
  ) : (
    <>
      <b style={{ fontWeight: 700 }}>{depth} visits</b> logged
    </>
  );

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "absolute",
        left: 12,
        right: 12,
        bottom: `calc(${bottomOffset}px + var(--safe-bottom))`,
        zIndex: 40,
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: T.surfaceAlt,
        border: `1px solid ${T.border}`,
        borderRadius: 14,
        padding: "11px 12px",
        boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
      }}
    >
      <span
        style={{
          width: 26,
          height: 26,
          borderRadius: "50%",
          background: tint(showNotice ? T.textDim : T.green, 0.18),
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Check size={14} color={showNotice ? T.textDim : T.green} strokeWidth={3} />
      </span>

      <span style={{ flex: 1, minWidth: 0, fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: T.text, lineHeight: 1.35 }}>
        {message}
      </span>

      {depth > 0 && (
        <button
          onClick={onUndo}
          aria-label={depth === 1 ? `Undo logging ${last.name}` : `Undo logging ${last.name}, ${depth} to undo`}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            background: T.surface,
            border: `1px solid ${T.border}`,
            borderRadius: 999,
            padding: "7px 13px",
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: 700,
            fontSize: 12,
            color: T.gold,
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <Undo2 size={13} color={T.gold} />
          Undo
        </button>
      )}
    </div>
  );
}
