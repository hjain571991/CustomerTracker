import React, { useEffect } from "react";
import { T } from "../theme.js";
import { PIN_LENGTH } from "../lib/pin.js";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];

/** Physical-keyboard entry, so the desktop-browser case works too. */
export function usePinKeyboard({ onDigit, onBackspace, onEscape }) {
  useEffect(() => {
    const handle = (e) => {
      if (/^\d$/.test(e.key)) onDigit(e.key);
      else if (e.key === "Backspace") onBackspace();
      else if (e.key === "Escape" && onEscape) onEscape();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [onDigit, onBackspace, onEscape]);
}

export function PinDots({ filled, error }) {
  return (
    <div style={{ display: "flex", gap: 14, justifyContent: "center" }}>
      {Array.from({ length: PIN_LENGTH }, (_, i) => (
        <div
          key={i}
          style={{
            width: 16,
            height: 16,
            borderRadius: "50%",
            background: i < filled ? (error ? T.red : T.gold) : "transparent",
            border: `2px solid ${error ? T.red : T.gold}`,
          }}
        />
      ))}
    </div>
  );
}

/**
 * The number pad. Callers own the PIN string; this only reports key presses,
 * which keeps the entry logic in one place per screen.
 */
export default function PinPad({ onDigit, onBackspace, maxWidth = 260 }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, width: "100%", maxWidth, margin: "0 auto" }}>
      {KEYS.map((d, i) =>
        d === "" ? (
          <div key={i} />
        ) : (
          <button
            key={i}
            type="button"
            aria-label={d === "⌫" ? "Delete" : d}
            onClick={() => (d === "⌫" ? onBackspace() : onDigit(d))}
            style={{
              background: T.surface,
              border: `1px solid ${T.border}`,
              borderRadius: 16,
              padding: "16px 0",
              fontFamily: "'Roboto Mono', monospace",
              fontSize: 20,
              fontWeight: 700,
              color: T.text,
              cursor: "pointer",
            }}
          >
            {d}
          </button>
        )
      )}
    </div>
  );
}
