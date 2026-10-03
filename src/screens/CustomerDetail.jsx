import React from "react";
import { ChevronLeft, Phone, PhoneCall, Trash2 } from "lucide-react";
import { T, tint } from "../theme.js";
import { avgGap, daysSinceLastVisit, regularity, statusFor, targetFor, visitDays } from "../lib/analytics.js";
import { reasonLabel } from "../lib/followups.js";
import { historyDays, visitCounts } from "../lib/visitCounts.js";
import { formatDate } from "../lib/dates.js";
import Avatar from "../components/Avatar.jsx";
import CadencePicker from "../components/CadencePicker.jsx";

/** Dots on a line: how far back each visit was, most recent on the right. */
function Timeline({ customer }) {
  const days = visitDays(customer);
  if (!days.length) return <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: T.textDim }}>No visits logged yet.</div>;
  const max = Math.max(...days, 1);
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ position: "relative", height: 46, marginBottom: 4 }}>
        <div style={{ position: "absolute", top: 18, left: 0, right: 0, height: 2, background: T.border }} />
        {days.map((d, i) => (
          <div
            key={i}
            title={`${d}d ago`}
            style={{
              position: "absolute",
              left: `${100 - (d / max) * 100}%`,
              top: 8,
              transform: "translateX(-50%)",
              width: 18,
              height: 18,
              borderRadius: "50%",
              background: T.gold,
              border: `3px solid ${T.surface}`,
            }}
          />
        ))}
        <div style={{ position: "absolute", left: "100%", top: 4, transform: "translateX(-100%)", fontSize: 11, fontFamily: "'DM Sans', sans-serif", color: T.textDim }}>
          today
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "'Roboto Mono', monospace", fontSize: 11, color: T.textDim }}>
        <span>{max}d ago</span>
        <span>now</span>
      </div>
    </div>
  );
}

export default function CustomerDetail({ customer, settings, back, openCalled, deleteCustomer, updateCustomer }) {
  const status = statusFor(customer, settings);
  const target = targetFor(customer, settings);
  const since = daysSinceLastVisit(customer);
  const contact = customer.contact;
  const gap = avgGap(customer);
  const rhythm = regularity(customer);

  const confirmDelete = () => {
    if (window.confirm(`Remove ${customer.name} and their visit history?`)) {
      deleteCustomer(customer.id);
      back();
    }
  };

  return (
    <div style={{ padding: "16px 16px 110px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <button onClick={back} aria-label="Back" style={{ background: "none", border: "none", display: "flex", alignItems: "center", cursor: "pointer", padding: 0 }}>
          <ChevronLeft size={24} color={T.gold} />
        </button>
        <button onClick={confirmDelete} aria-label={`Remove ${customer.name}`} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, lineHeight: 0 }}>
          <Trash2 size={18} color={T.textDim} />
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, marginBottom: 18 }}>
        <Avatar customer={customer} size={88} ring={status.color} />
        <div style={{ fontFamily: "'Roboto Slab', serif", fontWeight: 700, fontSize: 19, color: T.text, textAlign: "center" }}>{customer.name}</div>
        {customer.phone && (
          <a href={`tel:${customer.phone}`} style={{ display: "flex", alignItems: "center", gap: 6, color: T.gold, textDecoration: "none", fontFamily: "'Roboto Mono', monospace", fontSize: 13 }}>
            <Phone size={13} /> {customer.phone}
          </a>
        )}
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 12, padding: "4px 14px", borderRadius: 999, color: status.color, background: tint(status.color, 0.15) }}>
          {status.label}
        </div>
      </div>

      {contact && (
        <div style={{ background: tint(T.blue, 0.12), border: `1px solid ${tint(T.blue, 0.3)}`, borderRadius: 16, padding: 14, marginBottom: 14, display: "flex", alignItems: "flex-start", gap: 10 }}>
          <PhoneCall size={18} color={T.blue} style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700, color: T.blue }}>
              {reasonLabel(contact.reason) || "Called"}
            </div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.textDim, marginTop: 2 }}>
              You rang them on {formatDate(contact.on)}
            </div>
            {contact.note && (
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.text, marginTop: 6, lineHeight: 1.45 }}>
                “{contact.note}”
              </div>
            )}
          </div>
        </div>
      )}

      <button
        onClick={() => openCalled(customer)}
        style={{ width: "100%", background: T.blue, border: "none", borderRadius: 16, padding: "13px 0", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer", marginBottom: 18 }}
      >
        <PhoneCall size={18} color={T.onBlue} />
        <span style={{ color: T.onBlue, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14 }}>Record a call</span>
      </button>

      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 18, padding: 16, marginBottom: 16 }}>
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 12, color: T.textDim, marginBottom: 8 }}>VISIT PATTERN</div>
        <Timeline customer={customer} />
      </div>

      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 18, padding: 16, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 12, color: T.textDim }}>RESTOCKS EVERY</div>
          {target.isDefault && (
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 700, color: T.textDim, background: T.surfaceAlt, padding: "2px 8px", borderRadius: 999 }}>
              using default
            </span>
          )}
        </div>
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.textDim, marginBottom: 14, lineHeight: 1.5 }}>
          {gap !== null
            ? `They actually average ${gap} days between visits${gap > target.weeks * 7 ? " — longer than you expect" : ""}.`
            : "Not enough visits yet to compare against."}
        </div>
        <CadencePicker value={customer.visitEveryWeeks ?? null} onChange={(weeks) => updateCustomer(customer.id, { visitEveryWeeks: weeks })} />
        {customer.visitEveryWeeks != null && (
          <button
            onClick={() => updateCustomer(customer.id, { visitEveryWeeks: null })}
            style={{ marginTop: 14, width: "100%", background: "none", border: `1px solid ${T.border}`, borderRadius: 12, padding: "9px 0", fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.textDim, cursor: "pointer" }}
          >
            Use the app default ({settings.defaultIntervalWeeks === 1 ? "weekly" : `every ${settings.defaultIntervalWeeks} weeks`}) instead
          </button>
        )}
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        {[
          ["last seen", since === null ? "—" : since === 0 ? "today" : `${since}d`, true],
          ["visits logged", customer.visits.length, true],
          ["rhythm", rhythm || "—", false],
        ].map(([label, value, mono], i) => (
          <div key={i} style={{ flex: 1, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 16, padding: 14, textAlign: "center" }}>
            <div style={{ fontFamily: mono ? "'Roboto Mono', monospace" : "'DM Sans', sans-serif", fontWeight: 700, fontSize: mono ? 19 : 13, color: T.text }}>
              {value}
            </div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.textDim, marginTop: 3 }}>{label}</div>
          </div>
        ))}
      </div>

      {customer.visits.length > 0 && <VisitCounts customer={customer} />}

      {customer.visits.length > 0 && (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 18, padding: 16 }}>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 12, color: T.textDim, marginBottom: 10 }}>EVERY VISIT</div>
          {customer.visits.map((iso) => (
            <div key={iso} style={{ fontFamily: "'Roboto Mono', monospace", fontSize: 12, color: T.text, padding: "5px 0", borderBottom: `1px solid ${T.border}` }}>
              {formatDate(iso)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * How many times they have been in, over a few windows at once. Shown together
 * rather than behind a picker: four numbers side by side is the comparison,
 * and it costs no taps.
 */
function VisitCounts({ customer }) {
  const rows = visitCounts(customer);
  const days = historyDays(customer);
  // Only worth captioning when a window reaches past the records.
  const shortOf = rows.filter((r) => !r.coversPeriod);

  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 18, padding: 16, marginBottom: 16 }}>
      <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 12, color: T.textDim, marginBottom: 10 }}>
        HOW OFTEN THEY'VE BEEN IN
      </div>

      {rows.map((row, i) => (
        <div
          key={row.key}
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 12,
            padding: "8px 0",
            borderBottom: i === rows.length - 1 ? "none" : `1px solid ${T.border}`,
          }}
        >
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: T.textDim }}>
            {row.label}
            {!row.coversPeriod && (
              <span style={{ fontSize: 10, color: T.textDim, opacity: 0.75 }}> · partial</span>
            )}
          </span>
          <span style={{ fontFamily: "'Roboto Mono', monospace", fontWeight: 700, fontSize: 17, color: row.count === 0 ? T.textDim : T.text }}>
            {row.count}
          </span>
        </div>
      ))}

      {shortOf.length > 0 && (
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.textDim, marginTop: 10, lineHeight: 1.5 }}>
          Only {days < 14 ? `${days} days` : `${Math.round(days / 7)} weeks`} of history on record, so the longer
          windows are marked partial — they count everything there is, not a full period.
        </div>
      )}
    </div>
  );
}
