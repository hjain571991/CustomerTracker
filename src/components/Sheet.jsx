import React, { useEffect } from "react";
import { X } from "lucide-react";
import { T } from "../theme.js";

/** Bottom sheet: tap the scrim or press Escape to dismiss. */
export default function Sheet({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "flex-end",
        zIndex: 30,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: T.surface,
          width: "100%",
          borderRadius: "24px 24px 0 0",
          padding: "18px 18px calc(26px + env(safe-area-inset-bottom))",
          border: `1px solid ${T.border}`,
          borderBottom: "none",
          maxHeight: "82%",
          overflowY: "auto",
          boxSizing: "border-box",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, color: T.text, fontSize: 16 }}>{title}</div>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", padding: 4, lineHeight: 0 }}>
            <X size={22} color={T.textDim} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
