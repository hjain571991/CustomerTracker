import React from "react";
import { T } from "../theme.js";

/** A row of mutually exclusive views, the way the Reports screen has always shown them. */
export default function Segmented({ options, value, onChange, style }) {
  return (
    <div style={{ display: "flex", background: T.surfaceAlt, border: `1px solid ${T.border}`, borderRadius: 12, padding: 3, gap: 3, ...style }}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            aria-current={active ? "page" : undefined}
            style={{
              flex: 1,
              background: active ? T.surface : "transparent",
              border: active ? `1px solid ${T.border}` : "1px solid transparent",
              borderRadius: 9,
              padding: "8px 4px",
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 700,
              fontSize: 11.5,
              color: active ? T.text : T.textDim,
              cursor: "pointer",
              lineHeight: 1.2,
            }}
          >
            {o.label}
            {o.count != null && (
              <span style={{ fontFamily: "'Roboto Mono', monospace", fontSize: 10, color: active ? T.gold : T.textDim, marginLeft: 5 }}>
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
