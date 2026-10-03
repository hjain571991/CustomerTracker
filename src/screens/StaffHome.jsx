import React from "react";
import { Check, Clock, Lock, Sparkles } from "lucide-react";
import { T, tint } from "../theme.js";
import { statusFor } from "../lib/analytics.js";
import Avatar from "../components/Avatar.jsx";

/** The only screen shop staff ever see: a wall of faces, one tap to log a visit. */
export default function StaffHome({ customers, settings, logVisit, justLogged, openSheet, requestOwnerMode }) {
  return (
    <div style={{ padding: "20px 16px 40px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Sparkles size={24} color={T.gold} />
          <span style={{ fontFamily: "'Roboto Slab', serif", fontWeight: 700, fontSize: 21, color: T.text }}>
            Tap when they walk in
          </span>
        </div>
        <button
          onClick={requestOwnerMode}
          aria-label="Owner access"
          style={{
            width: 38,
            height: 38,
            borderRadius: "50%",
            background: T.surfaceAlt,
            border: `1px solid ${T.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <Lock size={16} color={T.textDim} />
        </button>
      </div>
      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: T.textDim, marginBottom: 18 }}>
        Forgot earlier? Tap the clock icon on a card to log a past day.
      </div>

      {customers.length === 0 ? (
        <EmptyState />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 14 }}>
          {customers.map((c) => {
            const status = statusFor(c, settings);
            const logged = justLogged === c.id;
            return (
              <div
                key={c.id}
                style={{
                  position: "relative",
                  background: T.surface,
                  border: `1px solid ${T.border}`,
                  borderRadius: 20,
                  padding: "18px 10px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <button
                  onClick={() => openSheet(c)}
                  aria-label={`Log an earlier visit for ${c.name}`}
                  style={{
                    position: "absolute",
                    top: 8,
                    right: 8,
                    width: 30,
                    height: 30,
                    borderRadius: "50%",
                    background: T.surfaceAlt,
                    border: `1px solid ${T.border}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                  }}
                >
                  <Clock size={14} color={T.gold} />
                </button>
                <button
                  onClick={() => logVisit(c.id, 0)}
                  style={{ background: "none", border: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, cursor: "pointer", width: "100%" }}
                >
                  <Avatar customer={c} size={70} ring={status.color} />
                  <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: T.text, textAlign: "center", lineHeight: 1.2 }}>
                    {c.name}
                  </div>
                  <div
                    style={{
                      fontFamily: "'DM Sans', sans-serif",
                      fontWeight: 700,
                      fontSize: 11,
                      padding: "3px 10px",
                      borderRadius: 999,
                      color: status.color,
                      background: tint(status.color, 0.15),
                    }}
                  >
                    {status.label}
                  </div>
                </button>
                {logged && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: "rgba(95,179,125,0.94)",
                      borderRadius: 20,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                    }}
                  >
                    <Check size={32} color="#12261B" strokeWidth={3} />
                    <span style={{ color: "#12261B", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 12 }}>Logged</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{ textAlign: "center", marginTop: 60, fontFamily: "'DM Sans', sans-serif", color: T.textDim, fontSize: 14, lineHeight: 1.6 }}>
      No customers yet.
      <br />
      Ask the owner to import the customer sheet.
    </div>
  );
}
