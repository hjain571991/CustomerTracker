import React, { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Lock } from "lucide-react";
import { T } from "../theme.js";
import { DEFAULT_PIN, PIN_LENGTH } from "../lib/pin.js";
import PinPad, { PinDots, usePinKeyboard } from "../components/PinPad.jsx";

export default function PinGate({ back, unlock, expectedPin }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);

  // `unlock` is an inline arrow in the parent, so a ref keeps the effect below
  // from re-running (and restarting its timer) on every parent render.
  const unlockRef = useRef(unlock);
  unlockRef.current = unlock;

  // Always append to the *latest* pin. Reading `pin` from the closure here
  // drops digits when two taps land before React commits a re-render.
  const onDigit = useCallback((d) => {
    setError(false);
    setPin((prev) => (prev.length >= PIN_LENGTH ? prev : prev + d));
  }, []);

  const onBackspace = useCallback(() => {
    setError(false);
    setPin((prev) => prev.slice(0, -1));
  }, []);

  usePinKeyboard({ onDigit, onBackspace, onEscape: back });

  // Checking in an effect rather than in the updater keeps the side effect out
  // of a function React may call twice in StrictMode.
  useEffect(() => {
    if (pin.length !== PIN_LENGTH) return undefined;
    const timer = setTimeout(() => {
      if (pin === expectedPin) {
        unlockRef.current();
      } else {
        setError(true);
        setPin("");
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [pin, expectedPin]);

  // Only advertise the PIN while it is still the shipped default — once the
  // owner sets their own, the hint disappears rather than leaking it.
  const isDefaultPin = expectedPin === DEFAULT_PIN;

  return (
    <div style={{ padding: "14px 24px 40px", display: "flex", flexDirection: "column", alignItems: "center" }}>
      {/* In flow, not absolute: floating it let the content scroll underneath. */}
      <div style={{ width: "100%", display: "flex" }}>
        <button
          onClick={back}
          aria-label="Back"
          style={{ background: "none", border: "none", cursor: "pointer", padding: 4, marginLeft: -4, lineHeight: 0 }}
        >
          <ArrowLeft size={22} color={T.textDim} />
        </button>
      </div>
      <Lock size={30} color={T.gold} style={{ marginTop: 26, marginBottom: 14 }} />
      <div style={{ fontFamily: "'Roboto Slab', serif", fontWeight: 700, fontSize: 19, color: T.text, marginBottom: 6 }}>Owner Access</div>
      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: error ? T.red : T.textDim, marginBottom: isDefaultPin ? 8 : 26 }}>
        {error ? "Wrong PIN — try again" : "Enter your PIN"}
      </div>
      {isDefaultPin && (
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.textDim, marginBottom: 22, textAlign: "center", lineHeight: 1.5 }}>
          Default PIN is <b style={{ color: T.gold, fontFamily: "'Roboto Mono', monospace" }}>{DEFAULT_PIN}</b>
          <br />
          Change it in Owner View → Settings
        </div>
      )}
      <div style={{ marginBottom: 30 }}>
        <PinDots filled={pin.length} error={error} />
      </div>
      <PinPad onDigit={onDigit} onBackspace={onBackspace} />
    </div>
  );
}
