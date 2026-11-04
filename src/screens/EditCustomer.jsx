import React, { useState } from "react";
import { Building2, ChevronLeft, Phone, PhoneOff, RotateCcw, Save, Type } from "lucide-react";
import { T, tint } from "../theme.js";
import { initialsFor } from "../lib/analytics.js";
import { reasonLabel } from "../lib/followups.js";
import { formatDate } from "../lib/dates.js";
import Avatar from "../components/Avatar.jsx";
import CadencePicker from "../components/CadencePicker.jsx";
import RepPicker from "../components/RepPicker.jsx";
import TierPicker from "../components/TierPicker.jsx";
import { useLayout } from "../lib/layout.js";

/**
 * Owner-only: every field on a customer record, in one form.
 *
 * The detail screen could already change the cadence in place, which is right
 * for the one thing you adjust while looking at someone's history. Correcting
 * a misspelt name or a wrong phone number is a different act — you want to see
 * the whole record, change several things, and confirm. So this is a form with
 * a save button, not a screen of live controls: nothing is written until the
 * owner says so, and leaving by the back arrow discards.
 *
 * Visits are not editable here. They are an append-only log of taps, corrected
 * by deleting the specific entry in Reports → Log, which keeps the audit trail
 * honest. Editing them as a text field would not.
 */
export default function EditCustomer({ customer, reps, tiers, settings, existingNames, back, save }) {
  const layout = useLayout();
  const [name, setName] = useState(customer.name || "");
  const [phone, setPhone] = useState(customer.phone || "");
  const [company, setCompany] = useState(customer.company || "");
  const [repId, setRepId] = useState(customer.repId || null);
  const [tierId, setTierId] = useState(customer.tierId || null);
  const [initials, setInitials] = useState(customer.initials || "");
  const [visitEveryWeeks, setVisitEveryWeeks] = useState(customer.visitEveryWeeks ?? null);
  // Recording a call can only ever overwrite the last one, so clearing a call
  // logged against the wrong shop has to live here.
  const [clearCall, setClearCall] = useState(false);

  const trimmedName = name.trim();
  const trimmedInitials = initials.trim().slice(0, 2).toUpperCase();
  const duplicate = existingNames.some((n) => n.toLowerCase() === trimmedName.toLowerCase());
  const canSave = trimmedName.length > 0 && !duplicate;

  // Initials follow the name unless the owner has typed their own.
  const autoInitials = initialsFor(customer.name) === customer.initials;
  const previewInitials = trimmedInitials || (trimmedName ? initialsFor(trimmedName) : "?");

  const dirty =
    trimmedName !== (customer.name || "") ||
    phone.trim() !== (customer.phone || "") ||
    company.trim() !== (customer.company || "") ||
    (repId || null) !== (customer.repId || null) ||
    (tierId || null) !== (customer.tierId || null) ||
    trimmedInitials !== (customer.initials || "") ||
    (visitEveryWeeks ?? null) !== (customer.visitEveryWeeks ?? null) ||
    clearCall;

  const submit = (e) => {
    e.preventDefault();
    if (!canSave) return;
    save({
      name: trimmedName,
      phone: phone.trim(),
      company: company.trim(),
      repId: repId || null,
      tierId: tierId || null,
      // Let `updateCustomer` re-derive them when they were never set by hand.
      ...(autoInitials && !trimmedInitials ? {} : { initials: previewInitials }),
      visitEveryWeeks: visitEveryWeeks ?? null,
      ...(clearCall ? { contact: null } : {}),
    });
  };

  const leave = () => {
    if (dirty && !window.confirm("Leave without saving your changes?")) return;
    back();
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
    <form
      onSubmit={submit}
      // A form is read line by line, so it stays a readable column however
      // wide the window gets rather than stretching to the full shell.
      style={{
        padding: `16px ${layout.gutter}px calc(40px + var(--safe-bottom))`,
        maxWidth: layout.readable,
        margin: "0 auto",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <button type="button" onClick={leave} aria-label="Back" style={{ background: "none", border: "none", display: "flex", alignItems: "center", cursor: "pointer", padding: 0 }}>
          <ChevronLeft size={24} color={T.gold} />
        </button>
        <span style={{ fontFamily: "'Roboto Slab', serif", fontWeight: 700, fontSize: 18, color: T.text }}>Edit profile</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 18 }}>
        <Avatar customer={{ initials: previewInitials }} size={82} ring={canSave ? T.gold : T.red} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Label>Shop or customer name</Label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Shop or customer name" style={field} autoComplete="off" />
        {!trimmedName && <Hint color={T.red}>A customer needs a name.</Hint>}
        {duplicate && <Hint color={T.red}>“{trimmedName}” is already on the list.</Hint>}

        <Label>Phone</Label>
        <div style={{ position: "relative" }}>
          <Phone size={17} color={T.gold} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)" }} />
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone number" inputMode="tel" style={{ ...field, paddingLeft: 40 }} autoComplete="off" />
        </div>

        <Label>Company name</Label>
        <div style={{ position: "relative" }}>
          <Building2 size={17} color={T.gold} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)" }} />
          <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company name (optional)" style={{ ...field, paddingLeft: 40 }} autoComplete="off" />
        </div>

        <Label>Marketing representative</Label>
        <RepPicker reps={reps} value={repId} onChange={setRepId} />

        <Label>Tier</Label>
        <TierPicker tiers={tiers} value={tierId} onChange={setTierId} />

        <Label>Initials on the badge</Label>
        <div style={{ position: "relative" }}>
          <Type size={17} color={T.gold} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)" }} />
          <input
            value={initials}
            onChange={(e) => setInitials(e.target.value.toUpperCase())}
            placeholder={trimmedName ? initialsFor(trimmedName) : "Taken from the name"}
            maxLength={2}
            style={{ ...field, paddingLeft: 40, fontFamily: "'Roboto Slab', serif", fontWeight: 700, letterSpacing: 1 }}
            autoComplete="off"
          />
        </div>
        <Hint>Leave blank to take them from the name.</Hint>

        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, padding: "14px 14px 16px", marginTop: 4 }}>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 12, color: T.textDim, marginBottom: 14 }}>
            HOW OFTEN DO THEY RESTOCK?
          </div>
          <CadencePicker value={visitEveryWeeks} onChange={setVisitEveryWeeks} />
          {visitEveryWeeks != null && (
            <button
              type="button"
              onClick={() => setVisitEveryWeeks(null)}
              style={{ marginTop: 14, width: "100%", background: "none", border: `1px solid ${T.border}`, borderRadius: 12, padding: "9px 0", fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.textDim, cursor: "pointer" }}
            >
              Use the app default ({settings.defaultIntervalWeeks === 1 ? "weekly" : `every ${settings.defaultIntervalWeeks} weeks`}) instead
            </button>
          )}
        </div>

        {customer.contact?.on && (
          <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, padding: 14, marginTop: 4 }}>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 12, color: T.textDim, marginBottom: 8 }}>
              LAST RECORDED CALL
            </div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: clearCall ? T.textDim : T.text, textDecoration: clearCall ? "line-through" : "none", lineHeight: 1.5 }}>
              {reasonLabel(customer.contact.reason) || "Called"} · {formatDate(customer.contact.on)}
              {customer.contact.note && (
                <span style={{ display: "block", fontSize: 12, color: T.textDim, marginTop: 3 }}>
                  “{customer.contact.note}”
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setClearCall((v) => !v)}
              style={{
                marginTop: 12,
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 7,
                background: clearCall ? tint(T.red, 0.12) : "none",
                border: `1px solid ${clearCall ? tint(T.red, 0.35) : T.border}`,
                borderRadius: 12,
                padding: "10px 0",
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: 700,
                fontSize: 12,
                color: clearCall ? T.red : T.textDim,
                cursor: "pointer",
              }}
            >
              {clearCall ? <RotateCcw size={14} color={T.red} /> : <PhoneOff size={14} color={T.textDim} />}
              {clearCall ? "Will be cleared on save — undo" : "Clear this call record"}
            </button>
          </div>
        )}

        <div style={{ background: T.surfaceAlt, border: `1px solid ${T.border}`, borderRadius: 14, padding: 13 }}>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11.5, color: T.textDim, lineHeight: 1.6 }}>
            Visit history is not edited here — it is a log of what was tapped. Remove a visit that should not be there
            under <b style={{ color: T.text }}>Reports → Log</b>.
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <button
            type="button"
            onClick={leave}
            style={{
              flex: "0 0 auto",
              background: "none",
              border: `1px solid ${T.border}`,
              borderRadius: 14,
              padding: "15px 20px",
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 700,
              fontSize: 14,
              color: T.textDim,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSave || !dirty}
            style={{
              flex: 1,
              background: canSave && dirty ? T.gold : T.surfaceAlt,
              border: "none",
              borderRadius: 14,
              padding: "15px 0",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              cursor: canSave && dirty ? "pointer" : "not-allowed",
            }}
          >
            <Save size={18} color={canSave && dirty ? T.onGold : T.textDim} />
            <span style={{ color: canSave && dirty ? T.onGold : T.textDim, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15 }}>
              {dirty ? "Save changes" : "Nothing changed"}
            </span>
          </button>
        </div>
      </div>
    </form>
  );
}

const Label = ({ children }) => (
  <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: 0.5, color: T.textDim, textTransform: "uppercase", margin: "6px 0 -6px 2px" }}>
    {children}
  </div>
);

const Hint = ({ children, color }) => (
  <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11.5, color: color || T.textDim, margin: "-6px 0 0 2px", lineHeight: 1.5 }}>
    {children}
  </div>
);
