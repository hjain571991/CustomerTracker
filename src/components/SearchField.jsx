import React from "react";
import { Search, X } from "lucide-react";
import { T } from "../theme.js";

/**
 * The search box, in the one place it is defined.
 *
 * Five screens search something now, and the staff one is used one-handed on a
 * shop floor — so the clear button matters more than it looks: without it,
 * getting back to the full wall of faces means holding backspace.
 */
export default function SearchField({ value, onChange, placeholder, autoFocus = false, style }) {
  return (
    <div style={{ position: "relative", ...style }}>
      <Search size={15} color={T.textDim} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
        aria-label={placeholder}
        style={{
          width: "100%",
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: 12,
          padding: `11px ${value ? 36 : 12}px 11px 34px`,
          color: T.text,
          fontFamily: "'DM Sans', sans-serif",
          fontSize: 13,
          boxSizing: "border-box",
        }}
      />
      {value && (
        <button
          onClick={() => onChange("")}
          aria-label="Clear search"
          style={{
            position: "absolute",
            right: 6,
            top: "50%",
            transform: "translateY(-50%)",
            width: 26,
            height: 26,
            borderRadius: "50%",
            background: T.surfaceAlt,
            border: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            padding: 0,
          }}
        >
          <X size={14} color={T.textDim} />
        </button>
      )}
    </div>
  );
}
