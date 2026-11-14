import React, { useCallback, useEffect, useState } from "react";
import { Check, ShieldCheck } from "lucide-react";
import { T } from "../theme.js";
import { PIN_LENGTH } from "../lib/pin.js";
import Sheet from "./Sheet.jsx";
import PinPad, { PinDots, usePinKeyboard } from "./PinPad.jsx";

const STEPS = {
  current: { title: "Change PIN", prompt: "Enter your current PIN" },
  next: { title: "Change PIN", prompt: `Choose a new ${PIN_LENGTH}-digit PIN` },
  confirm: { title: "Change PIN", prompt: "Enter it once more" },
  done: { title: "PIN changed", prompt: "" },
};

/** Current PIN, then the new one twice. Any mismatch restarts at the new PIN. */
export default function ChangePinSheet({ close, currentPin, changePin }) {
  const [step, setStep] = useState("current");
  const [entry, setEntry] = useState("");
  const [chosen, setChosen] = useState("");
  const [error, setError] = useState(null);

  const onDigit = useCallback((d) => {
    setError(null);
    setEntry((prev) => (prev.length >= PIN_LENGTH ? prev : prev + d));
  }, []);

  const onBackspace = useCallback(() => {
    setError(null);
    setEntry((prev) => prev.slice(0, -1));
  }, []);

  usePinKeyboard({ onDigit, onBackspace, onEscape: close });

  // Acting on a full entry happens here rather than in the key handler, so a
  // StrictMode double-invoke can't advance the flow twice.
  useEffect(() => {
    if (entry.length !== PIN_LENGTH || step === "done") return undefined;

    const timer = setTimeout(() => {
      if (step === "current") {
        if (entry === currentPin) {
          setStep("next");
          setEntry("");
        } else {
          setError("That's not your current PIN.");
          setEntry("");
        }
        return;
      }

      if (step === "next") {
        setChosen(entry);
        setStep("confirm");
        setEntry("");
        return;
      }

      if (entry === chosen) {
        const stored = changePin(entry);
        setStep("done");
        setEntry("");
        if (!stored) setError("Changed for now, but this browser refused to save it — it will revert on reload.");
      } else {
        setError("Those didn't match. Pick a new PIN again.");
        setChosen("");
        setStep("next");
        setEntry("");
      }
    }, 160);

    return () => clearTimeout(timer);
  }, [entry, step, chosen, currentPin, changePin]);

  const { title, prompt } = STEPS[step];

  return (
    <Sheet title={title} onClose={close}>
      {step === "done" ? (
        <div style={{ textAlign: "center", padding: "8px 0 4px" }}>
          <ShieldCheck size={40} color={T.green} />
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, color: T.text, margin: "12px 0 6px" }}>
            Your PIN has been changed
          </div>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: error ? T.amber : T.textDim, lineHeight: 1.5, marginBottom: 18 }}>
            {error || "Use the new PIN next time you open Owner View on this phone."}
          </div>
          <button
            onClick={close}
            style={{ width: "100%", background: T.gold, border: "none", borderRadius: 14, padding: "15px 0", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer" }}
          >
            <Check size={19} color={T.onGold} />
            <span style={{ color: T.onGold, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15 }}>Done</span>
          </button>
        </div>
      ) : (
        <div>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: error ? T.red : T.textDim, textAlign: "center", marginBottom: 16, minHeight: 34, lineHeight: 1.4 }}>
            {error || prompt}
          </div>
          <div style={{ marginBottom: 22 }}>
            <PinDots filled={entry.length} error={Boolean(error)} />
          </div>
          <PinPad onDigit={onDigit} onBackspace={onBackspace} />
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.textDim, textAlign: "center", marginTop: 16, lineHeight: 1.5 }}>
            Saved on this phone only. Clearing the browser's site data resets it.
          </div>
        </div>
      )}
    </Sheet>
  );
}
