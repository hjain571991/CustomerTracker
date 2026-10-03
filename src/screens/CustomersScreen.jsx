import React, { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { T, tint } from "../theme.js";
import { daysSinceLastVisit, statusFor, targetFor } from "../lib/analytics.js";
import Avatar from "../components/Avatar.jsx";

const ORDER = { missed: 0, dueThisWeek: 1, never: 2, onTrack: 3 };

export default function CustomersScreen({ customers, settings, openCustomer }) {
  const [query, setQuery] = useState("");

  const sorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    return customers
      .filter((c) => !q || c.name.toLowerCase().includes(q) || (c.phone || "").includes(q))
      .sort((a, b) => ORDER[statusFor(a, settings).key] - ORDER[statusFor(b, settings).key]);
  }, [customers, settings, query]);

  return (
    <div style={{ padding: "8px 16px 110px" }}>
      <div style={{ fontFamily: "'Roboto Slab', serif", fontWeight: 700, fontSize: 20, color: T.text, marginBottom: 4 }}>Customers</div>
      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: T.textDim, marginBottom: 14 }}>Measured against each customer's target. Most overdue first.</div>

      <div style={{ position: "relative", marginBottom: 14 }}>
        <Search size={15} color={T.textDim} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name or phone"
          style={{
            width: "100%",
            background: T.surface,
            border: `1px solid ${T.border}`,
            borderRadius: 12,
            padding: "11px 12px 11px 34px",
            color: T.text,
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 13,
            boxSizing: "border-box",
          }}
        />
      </div>

      {sorted.map((c) => {
        const status = statusFor(c, settings);
        const target = targetFor(c, settings);
        const since = daysSinceLastVisit(c);
        return (
          <button
            key={c.id}
            onClick={() => openCustomer(c)}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: 12,
              background: T.surface,
              border: `1px solid ${T.border}`,
              borderRadius: 14,
              padding: "10px 14px",
              marginBottom: 10,
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <Avatar customer={c} size={42} ring={status.color} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: T.text }}>{c.name}</div>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.textDim }}>
                {target.weeks === 1 ? "weekly" : `every ${target.weeks} weeks`}{target.isDefault && " (default)"}
                {since !== null ? ` · last seen ${since === 0 ? "today" : `${since}d ago`}`  : " · never visited"}
              </div>
            </div>
            <span
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: 700,
                fontSize: 11,
                color: status.color,
                background: tint(status.color, 0.15),
                borderRadius: 999,
                padding: "3px 9px",
                flexShrink: 0,
              }}
            >
              {status.label}
            </span>
          </button>
        );
      })}

      {sorted.length === 0 && (
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: T.textDim, textAlign: "center", marginTop: 30 }}>
          No customers match “{query}”.
        </div>
      )}
    </div>
  );
}
