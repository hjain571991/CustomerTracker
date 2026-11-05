import React, { useMemo, useState } from "react";
import { Check, Clock, Lock, Sparkles } from "lucide-react";
import { T, tint } from "../theme.js";
import { statusFor } from "../lib/analytics.js";
import { hasVisit } from "../lib/visits.js";
import { todayIso } from "../lib/dates.js";
import Avatar from "../components/Avatar.jsx";
import SearchField from "../components/SearchField.jsx";
import { screenPadding, useLayout } from "../lib/layout.js";

/** The only screen shop staff ever see: a wall of faces, one tap to log a visit. */
export default function StaffHome({ customers, settings, logVisit, justLogged, openSheet, requestOwnerMode }) {
  const layout = useLayout();
  const [query, setQuery] = useState("");

  /**
   * Matches the shop name, the company behind it and the phone number. Once a
   * book runs past a screen or two, scrolling a grid of faces to find one shop
   * is slower than typing three letters of its name.
   */
  const matching = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.company || "").toLowerCase().includes(q) ||
        (c.phone || "").includes(q)
    );
  }, [customers, query]);

  /**
   * Two groups, each A–Z: who has not been in today, then who has.
   *
   * Alphabetical because this screen is used with a customer standing at the
   * counter — you are looking for one known name, not browsing. And today's
   * taps sink to the bottom because once somebody is logged they are done
   * with: what is left at the top is the work still outstanding. The whole
   * thing resets itself overnight, with no state to manage.
   */
  const { pending, done } = useMemo(() => {
    const today = todayIso();
    const byName = [...matching].sort((a, b) => a.name.localeCompare(b.name));
    return {
      pending: byName.filter((c) => !hasVisit(c, today)),
      done: byName.filter((c) => hasVisit(c, today)),
    };
  }, [matching]);

  const shown = pending.length + done.length;

  return (
    <div style={{ ...screenPadding(layout, { top: 20, bottom: 40 }) }}>
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
      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: T.textDim, marginBottom: 14 }}>
        Forgot earlier? Tap the clock icon on a card to log a past day.
      </div>

      {customers.length > 0 && (
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Search name, company or phone"
          style={{ marginBottom: query ? 10 : 18 }}
        />
      )}

      {query && (
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.textDim, marginBottom: 14 }}>
          {shown} of {customers.length} {customers.length === 1 ? "customer" : "customers"}
        </div>
      )}

      {customers.length === 0 ? (
        <EmptyState />
      ) : shown === 0 ? (
        <NoMatches query={query} onClear={() => setQuery("")} />
      ) : (
        <>
          <FaceGrid
            customers={pending}
            layout={layout}
            settings={settings}
            logVisit={logVisit}
            justLogged={justLogged}
            openSheet={openSheet}
            // Only worth a heading once some have been logged; before the first
            // tap of the day the whole wall is "not in yet", which says nothing.
            heading={done.length > 0 ? `Not in yet · ${pending.length}` : null}
          />

          {done.length > 0 && (
            <FaceGrid
              customers={done}
              layout={layout}
              settings={settings}
              logVisit={logVisit}
              justLogged={justLogged}
              openSheet={openSheet}
              heading={`In today · ${done.length}`}
              dimmed
            />
          )}
        </>
      )}
    </div>
  );
}

/**
 * One wall of faces. Rendered twice — those still to come in, then those
 * already logged today — so the work left is always at the top.
 */
function FaceGrid({ customers, layout, settings, logVisit, justLogged, openSheet, heading, dimmed = false }) {
  if (!customers.length) return null;
  return (
    <div style={{ marginBottom: 20 }}>
      {heading && (
        <div
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: 700,
            fontSize: 11,
            letterSpacing: 0.6,
            textTransform: "uppercase",
            color: T.textDim,
            margin: "0 0 10px 2px",
          }}
        >
          {heading}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${layout.faceMin}px), 1fr))`, gap: 14 }}>
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
                // Still fully tappable — a second tap the same day is a no-op,
                // and the clock icon is how a *past* visit gets added.
                opacity: dimmed ? 0.55 : 1,
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
                onClick={() => logVisit(c.id, todayIso())}
                style={{ background: "none", border: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, cursor: "pointer", width: "100%" }}
              >
                <Avatar customer={c} size={70} ring={dimmed ? T.green : status.color} />
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
                    color: dimmed ? T.green : status.color,
                    background: tint(dimmed ? T.green : status.color, 0.15),
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  {dimmed && <Check size={12} color={T.green} strokeWidth={3} />}
                  {dimmed ? "In today" : status.label}
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
    </div>
  );
}

/**
 * A dead end on the staff screen is worse than elsewhere: whoever is holding
 * the phone has a customer standing in front of them. So the way back to the
 * full wall is a button, not a hunt for the backspace key.
 */
function NoMatches({ query, onClear }) {
  return (
    <div style={{ textAlign: "center", marginTop: 40, fontFamily: "'DM Sans', sans-serif", color: T.textDim, fontSize: 14, lineHeight: 1.6 }}>
      Nobody matches “{query}”.
      <button
        onClick={onClear}
        style={{
          display: "block",
          margin: "14px auto 0",
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: 999,
          padding: "9px 18px",
          fontFamily: "'DM Sans', sans-serif",
          fontWeight: 700,
          fontSize: 13,
          color: T.gold,
          cursor: "pointer",
        }}
      >
        Show everyone
      </button>
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
