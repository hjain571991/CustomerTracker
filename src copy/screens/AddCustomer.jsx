import React, { useState } from "react";
import { Building2, Check, Phone, UserPlus } from "lucide-react";
import { T } from "../theme.js";
import { initialsFor } from "../lib/analytics.js";
import Avatar from "../components/Avatar.jsx";
import CadencePicker from "../components/CadencePicker.jsx";
import { screenPadding, useLayout } from "../lib/layout.js";
import RepPicker from "../components/RepPicker.jsx";
import TierPicker from "../components/TierPicker.jsx";

export default function AddCustomer({ addCustomer, reps, tiers, existingNames, defaultCadence }) {
  const layout = useLayout();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [repId, setRepId] = useState(null);
  const [tierId, setTierId] = useState(null);
  const [visitEveryWeeks, setVisitEveryWeeks] = useState(defaultCadence);
  const [visitedToday, setVisitedToday] = useState(true);
  const [saved, setSaved] = useState(null);

  const trimmed = name.trim();
  const duplicate = existingNames.some((n) => n.toLowerCase() === trimmed.toLowerCase());
  const canSave = trimmed.length > 0 && !duplicate;

  const submit = (e) => {
    e.preventDefault();
    if (!canSave) return;
    addCustomer({ name: trimmed, phone: phone.trim(), company: company.trim(), repId, tierId, visitEveryWeeks, visitedToday });
    setSaved(trimmed);
    setName("");
    setPhone("");
    setCompany("");
    // The rep and tier are deliberately kept: new customers are usually added
    // in a run, and they tend to come from one rep and one grade of shop.
    setVisitEveryWeeks(defaultCadence);
    setVisitedToday(true);
    setTimeout(() => setSaved(null), 2200);
  };

  const field = {
    width: "100%",
    background: T.surface,
    border: `1px solid ${T.border}`,
    borderRadius: 14,
    padding: "15px 14px",
    color: T.text,
    fontFamily: "'DM Sans', sans-serif",
    fontSize: 15,
    boxSizing: "border-box",
  };

  return (
    <form onSubmit={submit} style={{ ...screenPadding(layout), display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ fontFamily: "'Roboto Slab', serif", fontWeight: 700, fontSize: 20, color: T.text, marginBottom: 20 }}>New Customer</div>

      <Avatar customer={{ initials: trimmed ? initialsFor(trimmed) : "?" }} size={92} ring={trimmed ? T.gold : T.border} />
      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.textDim, margin: "10px 0 22px" }}>
        Initials are taken from the name
      </div>

      <div style={{ width: "100%", maxWidth: 340, display: "flex", flexDirection: "column", gap: 12 }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Shop or customer name" style={field} autoComplete="off" />
        {duplicate && (
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.red }}>“{trimmed}” is already on the list.</div>
        )}

        <div style={{ position: "relative" }}>
          <Phone size={17} color={T.gold} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)" }} />
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Phone number (for call reminders)"
            inputMode="tel"
            style={{ ...field, paddingLeft: 40 }}
            autoComplete="off"
          />
        </div>

        <div style={{ position: "relative" }}>
          <Building2 size={17} color={T.gold} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)" }} />
          <input
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="Company name (optional)"
            style={{ ...field, paddingLeft: 40 }}
            autoComplete="off"
          />
        </div>

        <RepPicker reps={reps} value={repId} onChange={setRepId} />

        <TierPicker tiers={tiers} value={tierId} onChange={setTierId} />

        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, padding: "14px 14px 16px" }}>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 12, color: T.textDim, marginBottom: 4 }}>
            HOW OFTEN DO THEY RESTOCK?
          </div>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.textDim, marginBottom: 14, lineHeight: 1.5 }}>
            A visit any day that week counts. You'll be told on Monday if the week passed without them.
          </div>
          <CadencePicker value={visitEveryWeeks} onChange={setVisitEveryWeeks} />
        </div>

        <button
          type="button"
          onClick={() => setVisitedToday((v) => !v)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: T.surface,
            border: `1px solid ${T.border}`,
            borderRadius: 14,
            padding: "14px",
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <span
            style={{
              width: 22,
              height: 22,
              borderRadius: 7,
              border: `2px solid ${visitedToday ? T.gold : T.border}`,
              background: visitedToday ? T.gold : "transparent",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {visitedToday && <Check size={14} color={T.onGold} strokeWidth={3} />}
          </span>
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: T.text }}>They're in the shop today</span>
        </button>

        <button
          type="submit"
          disabled={!canSave}
          style={{
            width: "100%",
            background: canSave ? T.gold : T.surfaceAlt,
            border: "none",
            borderRadius: 14,
            padding: "15px 0",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            cursor: canSave ? "pointer" : "not-allowed",
            marginTop: 4,
          }}
        >
          <UserPlus size={19} color={canSave ? T.onGold : T.textDim} />
          <span style={{ color: canSave ? T.onGold : T.textDim, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15 }}>Add Customer</span>
        </button>

        {saved && (
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: T.green, textAlign: "center" }}>
            {saved} added.
          </div>
        )}
      </div>
    </form>
  );
}
