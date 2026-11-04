import React from "react";
import { AlertCircle, Check, UserPlus } from "lucide-react";
import { T } from "../theme.js";
import { describePlan } from "../lib/importCustomers.js";
import Sheet from "./Sheet.jsx";

/**
 * What the file is about to do, before it does it.
 *
 * A bulk import is the one action here that can quietly change sixty records,
 * and a spreadsheet is the one input nobody proof-reads. So nothing is written
 * until this has been read: the names going in, the names changing and exactly
 * which fields change on each, and any rep or tier the file introduces.
 *
 * It also says plainly what is *not* touched. The fear this screen exists to
 * settle is "will this wipe my visit history?", and the answer has to be on
 * the screen rather than in a manual.
 */
export default function ImportPreviewSheet({ plan, filename, onCancel, onConfirm }) {
  const nothing = plan.changes === 0;

  return (
    <Sheet title="Add customers from a file" onClose={onCancel}>
      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.textDim, marginBottom: 14, lineHeight: 1.5 }}>
        From <b style={{ color: T.text }}>{filename}</b> — {plan.rows} {plan.rows === 1 ? "row" : "rows"} read.
      </div>

      {nothing ? (
        <div style={{ background: T.surfaceAlt, border: `1px solid ${T.border}`, borderRadius: 14, padding: 14, marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
            <AlertCircle size={17} color={T.amber} style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: T.text, lineHeight: 1.5 }}>
              {plan.rows === 0
                ? "No customers found in that file. The sheet needs a name column with at least one row under it."
                : `Everything in that file already matches what you have, so there is nothing to change.`}
            </div>
          </div>
        </div>
      ) : (
        <>
          <Block
            colour={T.green}
            icon={UserPlus}
            title={`${plan.adds.length} new ${plan.adds.length === 1 ? "customer" : "customers"}`}
            hidden={plan.adds.length === 0}
          >
            {plan.adds.map((c) => (
              <Line key={c.name}>
                <b style={{ color: T.text, fontWeight: 700 }}>{c.name}</b>
                {[c.company, c.phone, c.tierName, c.repName].filter(Boolean).length > 0 && (
                  <span style={{ color: T.textDim }}>
                    {" · "}
                    {[c.company, c.phone, c.tierName, c.repName].filter(Boolean).join(" · ")}
                  </span>
                )}
              </Line>
            ))}
          </Block>

          <Block
            colour={T.blue}
            icon={Check}
            title={`${plan.updates.length} already on your list ${plan.updates.length === 1 ? "is" : "are"} updated`}
            hidden={plan.updates.length === 0}
          >
            {plan.updates.map((u) => (
              <Line key={u.id}>
                <b style={{ color: T.text, fontWeight: 700 }}>{u.name}</b>
                <span style={{ color: T.textDim }}> · {u.fields.join(", ")}</span>
              </Line>
            ))}
          </Block>

          {(plan.newReps.length > 0 || plan.newTiers.length > 0) && (
            <Block colour={T.gold} icon={UserPlus} title="Added to your lists">
              {plan.newReps.map((n) => (
                <Line key={`rep-${n}`}>
                  <b style={{ color: T.text, fontWeight: 700 }}>{n}</b>
                  <span style={{ color: T.textDim }}> · new marketing rep</span>
                </Line>
              ))}
              {plan.newTiers.map((n) => (
                <Line key={`tier-${n}`}>
                  <b style={{ color: T.text, fontWeight: 700 }}>{n}</b>
                  <span style={{ color: T.textDim }}> · new tier, placed last in the order</span>
                </Line>
              ))}
            </Block>
          )}

          {plan.unchanged.length > 0 && (
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11.5, color: T.textDim, marginBottom: 14, lineHeight: 1.5 }}>
              {plan.unchanged.length} {plan.unchanged.length === 1 ? "row matches" : "rows match"} what you already have
              and {plan.unchanged.length === 1 ? "is" : "are"} left alone.
            </div>
          )}

          <div style={{ background: T.surfaceAlt, border: `1px solid ${T.border}`, borderRadius: 14, padding: 13, marginBottom: 16 }}>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11.5, color: T.textDim, lineHeight: 1.6 }}>
              Visits, reminders and recorded calls are <b style={{ color: T.text }}>not</b> touched, and a blank cell in
              your file never clears what you already have.
            </div>
          </div>
        </>
      )}

      <div style={{ display: "flex", gap: 10 }}>
        <button
          onClick={onCancel}
          style={{
            flex: "0 0 auto",
            background: "none",
            border: `1px solid ${T.border}`,
            borderRadius: 14,
            padding: "14px 20px",
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
          onClick={onConfirm}
          disabled={nothing}
          style={{
            flex: 1,
            background: nothing ? T.surfaceAlt : T.gold,
            border: "none",
            borderRadius: 14,
            padding: "14px 0",
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: 700,
            fontSize: 15,
            color: nothing ? T.textDim : T.onGold,
            cursor: nothing ? "not-allowed" : "pointer",
          }}
        >
          {nothing ? "Nothing to add" : describePlan(plan)}
        </button>
      </div>
    </Sheet>
  );
}

function Block({ colour, icon: Icon, title, children, hidden }) {
  if (hidden) return null;
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderLeft: `3px solid ${colour}`, borderRadius: 14, padding: "11px 13px", marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 7 }}>
        <Icon size={14} color={colour} />
        <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 12.5, color: colour }}>{title}</span>
      </div>
      {/* Long imports are capped so the buttons stay reachable without a hunt. */}
      <div style={{ maxHeight: 190, overflowY: "auto" }}>{children}</div>
    </div>
  );
}

const Line = ({ children }) => (
  <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.text, padding: "3px 0", lineHeight: 1.4 }}>
    {children}
  </div>
);
