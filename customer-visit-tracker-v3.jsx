import React, { useState } from "react";
import {
  Camera,
  Mic,
  Plus,
  ChevronLeft,
  Check,
  Users,
  AlertCircle,
  Sparkles,
  Clock,
  Phone,
  PhoneCall,
  X,
  Minus,
  Lock,
  BellPlus,
  ArrowLeft,
  Trash2,
} from "lucide-react";

// ---- Design tokens (dark) ----
const T = {
  bg: "#171310",
  surface: "#221C16",
  surfaceAlt: "#2B241C",
  border: "#3A3025",
  text: "#F2E9D8",
  textDim: "#A89A84",
  gold: "#D6A94D",
  goldDeep: "#A67C27",
  green: "#5FB37D",
  amber: "#E0A83E",
  red: "#E2685C",
  blue: "#6E93D9",
  grey: "#8A7E6E",
};

const STATUS = {
  onTrack: { label: "On track", color: T.green },
  dueSoon: { label: "Due soon", color: T.amber },
  overdue: { label: "Overdue", color: T.red },
  fresh: { label: "New", color: T.grey },
};

function tint(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

const initialCustomers = [
  { id: 1, name: "Rajesh Traders", initials: "RT", phone: "9820011223", visits: [2, 16, 29, 44, 58], call: { calledDaysAgo: 5, daysUntilPromised: -2 } },
  { id: 2, name: "Shree Ambika Jewels", initials: "SA", phone: "9833344556", visits: [1, 8, 15, 23, 30], call: null },
  { id: 3, name: "Patel & Sons", initials: "PS", phone: "9811122334", visits: [38, 40, 70, 72], call: { calledDaysAgo: 6, daysUntilPromised: -1 } },
  { id: 4, name: "Ganesh Ornaments", initials: "GO", phone: "9845567788", visits: [4], call: { calledDaysAgo: 2, daysUntilPromised: 3 } },
  { id: 5, name: "Laxmi Gold House", initials: "LG", phone: "9822233445", visits: [11, 13, 40, 41, 68], call: null },
  { id: 6, name: "Vraj Jewellers", initials: "VJ", phone: "9877766554", visits: [9, 22, 34, 47, 61], call: { calledDaysAgo: 10, daysUntilPromised: -5 } },
];

const initialReminders = [
  { id: 101, customerId: 5, dueInDays: 4, note: "Ask about their Diwali order" },
  { id: 102, customerId: 2, dueInDays: -2, note: "Referral follow-up she mentioned" },
];

function gapsOf(visits) {
  const g = [];
  for (let i = 0; i < visits.length - 1; i++) g.push(visits[i + 1] - visits[i]);
  return g;
}
function statusFor(visits) {
  if (visits.length < 2) return STATUS.fresh;
  const g = gapsOf(visits);
  const avg = g.reduce((a, b) => a + b, 0) / g.length;
  const lastGap = visits[0];
  if (lastGap > avg * 1.6) return STATUS.overdue;
  if (lastGap > avg * 0.9) return STATUS.dueSoon;
  return STATUS.onTrack;
}
function avgGap(visits) {
  if (visits.length < 2) return null;
  const g = gapsOf(visits);
  return Math.round(g.reduce((a, b) => a + b, 0) / g.length);
}
function regularity(visits) {
  if (visits.length < 3) return null;
  const g = gapsOf(visits);
  const avg = g.reduce((a, b) => a + b, 0) / g.length;
  const variance = g.reduce((a, b) => a + (b - avg) * (b - avg), 0) / g.length;
  const ratio = Math.sqrt(variance) / avg;
  if (ratio < 0.25) return "very regular";
  if (ratio < 0.6) return "fairly regular";
  return "irregular";
}
function callStatusFor(customer) {
  const call = customer.call;
  if (!call) return null;
  const fulfilled = customer.visits.some((v) => v < call.calledDaysAgo);
  if (fulfilled) return { key: "fulfilled", label: "Came in as promised", color: T.green };
  if (call.daysUntilPromised > 0) return { key: "upcoming", label: `Expected in ${call.daysUntilPromised}d`, color: T.blue };
  if (call.daysUntilPromised === 0) return { key: "today", label: "Expected today", color: T.amber };
  return { key: "missed", label: `Didn't come \u2014 ${-call.daysUntilPromised}d overdue`, color: T.red };
}
function reminderStatus(r) {
  if (r.dueInDays > 0) return { key: "upcoming", label: `Call in ${r.dueInDays}d`, color: T.blue };
  if (r.dueInDays === 0) return { key: "today", label: "Call today", color: T.amber };
  return { key: "overdue", label: `${-r.dueInDays}d overdue`, color: T.red };
}

function Avatar({ c, size = 64, ring }) {
  return (
    <div
      style={{
        width: size, height: size, borderRadius: "50%",
        background: T.surfaceAlt, border: `3px solid ${ring}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "'Roboto Slab', serif", fontWeight: 700, fontSize: size * 0.32,
        color: T.text, flexShrink: 0,
      }}
    >
      {c.initials}
    </div>
  );
}

/* ---------------- STAFF SIDE (only screen staff ever see) ---------------- */

function LogVisitSheet({ customer, close, logVisit }) {
  const [gridOpen, setGridOpen] = useState(false);
  const quick = [{ label: "Yesterday", days: 1 }, { label: "2 days ago", days: 2 }, { label: "3 days ago", days: 3 }];
  const pick = (days) => { logVisit(customer.id, days); close(); };
  return (
    <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-end", zIndex: 30 }}>
      <div style={{ background: T.surface, width: "100%", borderRadius: "24px 24px 0 0", padding: "18px 18px 26px", border: `1px solid ${T.border}`, borderBottom: "none" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Avatar c={customer} size={34} ring={T.gold} />
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, color: T.text }}>Log an earlier visit</span>
          </div>
          <button onClick={close} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={22} color={T.textDim} /></button>
        </div>
        {!gridOpen ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {quick.map((q) => (
              <button key={q.days} onClick={() => pick(q.days)} style={{ background: T.surfaceAlt, border: `1px solid ${T.border}`, borderRadius: 14, padding: "16px 18px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 16, color: T.text, textAlign: "left", cursor: "pointer" }}>
                {q.label}
              </button>
            ))}
            <button onClick={() => setGridOpen(true)} style={{ background: T.surfaceAlt, border: `1px solid ${T.border}`, borderRadius: 14, padding: "16px 18px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 16, color: T.gold, textAlign: "left", cursor: "pointer" }}>
              Earlier than that\u2026
            </button>
          </div>
        ) : (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8, marginBottom: 8 }}>
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                <button key={d} onClick={() => pick(d)} style={{ aspectRatio: "1", background: T.surfaceAlt, border: `1px solid ${T.border}`, borderRadius: 10, fontFamily: "'Roboto Mono', monospace", fontWeight: 700, fontSize: 13, color: T.text, cursor: "pointer" }}>
                  {d}
                </button>
              ))}
            </div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.textDim, textAlign: "center" }}>days ago</div>
          </div>
        )}
      </div>
    </div>
  );
}

function StaffHome({ customers, logVisit, justLogged, openSheet, requestOwnerMode }) {
  return (
    <div style={{ padding: "20px 16px 40px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Sparkles size={24} color={T.gold} />
          <span style={{ fontFamily: "'Roboto Slab', serif", fontWeight: 700, fontSize: 21, color: T.text }}>
            Tap when they walk in
          </span>
        </div>
        <button onClick={requestOwnerMode} style={{ width: 38, height: 38, borderRadius: "50%", background: T.surfaceAlt, border: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <Lock size={16} color={T.textDim} />
        </button>
      </div>
      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: T.textDim, marginBottom: 18 }}>
        Forgot earlier? Tap the clock icon on a card to log a past day.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {customers.map((c) => {
          const status = statusFor(c.visits);
          const logged = justLogged === c.id;
          return (
            <div key={c.id} style={{ position: "relative", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 20, padding: "18px 10px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              <button onClick={() => openSheet(c)} style={{ position: "absolute", top: 8, right: 8, width: 30, height: 30, borderRadius: "50%", background: T.surfaceAlt, border: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                <Clock size={14} color={T.gold} />
              </button>
              <button onClick={() => logVisit(c.id, 0)} style={{ background: "none", border: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, cursor: "pointer", width: "100%" }}>
                <Avatar c={c} size={70} ring={status.color} />
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: T.text, textAlign: "center", lineHeight: 1.2 }}>{c.name}</div>
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 11, padding: "3px 10px", borderRadius: 999, color: status.color, background: tint(status.color, 0.15) }}>
                  {status.label}
                </div>
              </button>
              {logged && (
                <div style={{ position: "absolute", inset: 0, background: "rgba(95,179,125,0.94)", borderRadius: 20, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6 }}>
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

function PinGate({ back, unlock }) {
  const [pin, setPin] = useState("");
  const press = (d) => {
    const next = pin.length < 4 ? pin + d : pin;
    setPin(next);
    if (next.length === 4) setTimeout(() => unlock(), 200);
  };
  return (
    <div style={{ padding: "60px 24px 40px", display: "flex", flexDirection: "column", alignItems: "center" }}>
      <button onClick={back} style={{ position: "absolute", top: 20, left: 16, background: "none", border: "none", cursor: "pointer" }}>
        <ArrowLeft size={22} color={T.textDim} />
      </button>
      <Lock size={30} color={T.gold} style={{ marginBottom: 14 }} />
      <div style={{ fontFamily: "'Roboto Slab', serif", fontWeight: 700, fontSize: 19, color: T.text, marginBottom: 6 }}>Owner Access</div>
      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: T.textDim, marginBottom: 26 }}>Enter your PIN</div>
      <div style={{ display: "flex", gap: 14, marginBottom: 30 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ width: 16, height: 16, borderRadius: "50%", background: i < pin.length ? T.gold : "transparent", border: `2px solid ${T.gold}` }} />
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, width: "100%", maxWidth: 260 }}>
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "\u232B"].map((d, i) =>
          d === "" ? <div key={i} /> : (
            <button key={i} onClick={() => (d === "\u232B" ? setPin((p) => p.slice(0, -1)) : press(d))} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 16, padding: "16px 0", fontFamily: "'Roboto Mono', monospace", fontSize: 20, fontWeight: 700, color: T.text, cursor: "pointer" }}>
              {d}
            </button>
          )
        )}
      </div>
      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.textDim, marginTop: 20 }}>
        (Prototype: any 4 digits unlock Owner View)
      </div>
    </div>
  );
}

/* ---------------- OWNER SIDE ---------------- */

function OwnerNav({ tab, setTab, exit }) {
  const items = [
    { key: "followups", icon: PhoneCall },
    { key: "customers", icon: Users },
    { key: "add", icon: Plus },
  ];
  return (
    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 76, background: T.surface, borderTop: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-around" }}>
      {items.map(({ key, icon: Icon }) => {
        const active = tab === key;
        return (
          <button key={key} onClick={() => setTab(key)} style={{ background: active ? tint(T.gold, 0.16) : "transparent", border: "none", borderRadius: 18, width: 60, height: 60, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <Icon size={26} color={active ? T.gold : T.textDim} strokeWidth={2.2} />
          </button>
        );
      })}
    </div>
  );
}

function AddReminderSheet({ customers, close, addReminder }) {
  const [step, setStep] = useState("pick");
  const [customerId, setCustomerId] = useState(null);
  const [days, setDays] = useState(3);
  const [note, setNote] = useState("");
  const presets = [{ label: "Tomorrow", days: 1 }, { label: "2 days", days: 2 }, { label: "3 days", days: 3 }, { label: "1 week", days: 7 }];
  const customer = customers.find((c) => c.id === customerId);

  return (
    <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-end", zIndex: 30 }}>
      <div style={{ background: T.surface, width: "100%", borderRadius: "24px 24px 0 0", padding: "18px 18px 26px", border: `1px solid ${T.border}`, borderBottom: "none", maxHeight: "80%", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, color: T.text, fontSize: 16 }}>
            {step === "pick" ? "Remind me to call\u2026" : "When & why"}
          </span>
          <button onClick={close} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={22} color={T.textDim} /></button>
        </div>

        {step === "pick" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            {customers.map((c) => (
              <button key={c.id} onClick={() => { setCustomerId(c.id); setStep("detail"); }} style={{ background: "none", border: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, cursor: "pointer" }}>
                <Avatar c={c} size={56} ring={T.border} />
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.text, textAlign: "center" }}>{c.name.split(" ")[0]}</span>
              </button>
            ))}
          </div>
        )}

        {step === "detail" && customer && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <Avatar c={customer} size={40} ring={T.gold} />
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, color: T.text }}>{customer.name}</span>
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
              {presets.map((p) => (
                <button key={p.days} onClick={() => setDays(p.days)} style={{ background: days === p.days ? T.gold : T.surfaceAlt, color: days === p.days ? "#211605" : T.text, border: `1px solid ${T.border}`, borderRadius: 999, padding: "10px 16px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                  {p.label}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 20, marginBottom: 18 }}>
              <button onClick={() => setDays((d) => Math.max(1, d - 1))} style={{ width: 42, height: 42, borderRadius: "50%", background: T.surfaceAlt, border: `1px solid ${T.border}`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Minus size={18} color={T.text} />
              </button>
              <div style={{ fontFamily: "'Roboto Mono', monospace", fontWeight: 700, fontSize: 24, color: T.text, minWidth: 80, textAlign: "center" }}>{days} {days === 1 ? "day" : "days"}</div>
              <button onClick={() => setDays((d) => Math.min(30, d + 1))} style={{ width: 42, height: 42, borderRadius: "50%", background: T.surfaceAlt, border: `1px solid ${T.border}`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Plus size={18} color={T.text} />
              </button>
            </div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note (optional) \u2014 e.g. what to talk to them about"
              style={{ width: "100%", background: T.surfaceAlt, border: `1px solid ${T.border}`, borderRadius: 12, padding: 12, color: T.text, fontFamily: "'DM Sans', sans-serif", fontSize: 13, minHeight: 60, marginBottom: 16, resize: "none", boxSizing: "border-box" }}
            />
            <button
              onClick={() => { addReminder(customer.id, days, note); close(); }}
              style={{ width: "100%", background: T.gold, border: "none", borderRadius: 14, padding: "15px 0", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer" }}
            >
              <BellPlus size={20} color="#211605" />
              <span style={{ color: "#211605", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15 }}>Set Reminder</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function FollowUpsScreen({ customers, reminders, openCustomer, dismissReminder, openAddReminder }) {
  const promiseItems = customers
    .filter((c) => callStatusFor(c))
    .map((c) => ({ kind: "promise", customer: c, status: callStatusFor(c) }));
  const reminderItems = reminders.map((r) => ({
    kind: "reminder",
    customer: customers.find((c) => c.id === r.customerId),
    status: reminderStatus(r),
    reminder: r,
  }));
  const all = [...promiseItems, ...reminderItems];
  const rank = { overdue: 0, missed: 0, today: 1, upcoming: 2, fulfilled: 3 };
  all.sort((a, b) => rank[a.status.key] - rank[b.status.key]);

  return (
    <div style={{ padding: "20px 16px 100px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <div style={{ fontFamily: "'Roboto Slab', serif", fontWeight: 700, fontSize: 20, color: T.text }}>Follow-ups</div>
        <button onClick={openAddReminder} style={{ width: 40, height: 40, borderRadius: "50%", background: T.gold, border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <Plus size={20} color="#211605" />
        </button>
      </div>
      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: T.textDim, marginBottom: 18 }}>
        Promises customers made, and reminders you've set.
      </div>

      {all.length === 0 && (
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: T.textDim, textAlign: "center", marginTop: 40 }}>
          Nothing to follow up on right now.
        </div>
      )}

      {all.map((item, i) => (
        <div key={i} onClick={() => openCustomer(item.customer)} style={{ display: "flex", alignItems: "center", gap: 12, background: T.surface, border: `1px solid ${T.border}`, borderLeft: `3px solid ${item.status.color}`, borderRadius: 14, padding: "12px 14px", marginBottom: 10, cursor: "pointer" }}>
          <Avatar c={item.customer} size={42} ring={item.status.color} />
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: T.text }}>{item.customer.name}</span>
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 700, color: T.textDim, background: T.surfaceAlt, padding: "1px 7px", borderRadius: 999 }}>
                {item.kind === "promise" ? "Promise" : "Reminder"}
              </span>
            </div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: item.status.color, fontWeight: 700, marginTop: 2 }}>{item.status.label}</div>
            {item.kind === "reminder" && item.reminder.note && (
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.textDim, marginTop: 3 }}>{item.reminder.note}</div>
            )}
          </div>
          {item.customer.phone && (
            <a href={`tel:${item.customer.phone}`} onClick={(e) => e.stopPropagation()} style={{ width: 36, height: 36, borderRadius: "50%", background: tint(item.status.color, 0.18), display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Phone size={15} color={item.status.color} />
            </a>
          )}
          {item.kind === "reminder" && (
            <button onClick={(e) => { e.stopPropagation(); dismissReminder(item.reminder.id); }} style={{ width: 36, height: 36, borderRadius: "50%", background: T.surfaceAlt, border: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <Check size={15} color={T.textDim} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function Timeline({ visits }) {
  if (visits.length === 0) return null;
  const max = Math.max(...visits, 1);
  const sorted = [...visits].sort((a, b) => b - a);
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ position: "relative", height: 46, marginBottom: 4 }}>
        <div style={{ position: "absolute", top: 18, left: 0, right: 0, height: 2, background: T.border }} />
        {sorted.map((d, i) => (
          <div key={i} style={{ position: "absolute", left: `${100 - (d / max) * 100}%`, top: 8, transform: "translateX(-50%)", width: 18, height: 18, borderRadius: "50%", background: T.gold, border: `3px solid ${T.surface}` }} />
        ))}
        <div style={{ position: "absolute", left: "100%", top: 4, transform: "translateX(-100%)", fontSize: 11, fontFamily: "'DM Sans', sans-serif", color: T.textDim }}>today</div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "'Roboto Mono', monospace", fontSize: 11, color: T.textDim }}>
        <span>{max}d ago</span><span>now</span>
      </div>
    </div>
  );
}

function CustomerDetail({ customer, back, openCallSheet }) {
  const status = statusFor(customer.visits);
  const cs = callStatusFor(customer);
  const ag = avgGap(customer.visits);
  const reg = regularity(customer.visits);
  return (
    <div style={{ padding: "16px 16px 100px" }}>
      <button onClick={back} style={{ background: "none", border: "none", display: "flex", alignItems: "center", gap: 4, cursor: "pointer", marginBottom: 14, padding: 0 }}>
        <ChevronLeft size={24} color={T.gold} />
      </button>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, marginBottom: 18 }}>
        <Avatar c={customer} size={88} ring={status.color} />
        <div style={{ fontFamily: "'Roboto Slab', serif", fontWeight: 700, fontSize: 19, color: T.text }}>{customer.name}</div>
        {customer.phone && (
          <a href={`tel:${customer.phone}`} style={{ display: "flex", alignItems: "center", gap: 6, color: T.gold, textDecoration: "none", fontFamily: "'Roboto Mono', monospace", fontSize: 13 }}>
            <Phone size={13} /> {customer.phone}
          </a>
        )}
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 12, padding: "4px 14px", borderRadius: 999, color: status.color, background: tint(status.color, 0.15) }}>{status.label}</div>
      </div>

      {cs && (
        <div style={{ background: tint(cs.color, 0.12), border: `1px solid ${tint(cs.color, 0.3)}`, borderRadius: 16, padding: 14, marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
          <PhoneCall size={18} color={cs.color} />
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700, color: cs.color }}>{cs.label}</div>
        </div>
      )}

      <button onClick={() => openCallSheet(customer)} style={{ width: "100%", background: T.blue, border: "none", borderRadius: 16, padding: "13px 0", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer", marginBottom: 18 }}>
        <PhoneCall size={18} color="#0F1A2E" />
        <span style={{ color: "#0F1A2E", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14 }}>Log a Call (they promised to come)</span>
      </button>

      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 18, padding: 16, marginBottom: 16 }}>
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 12, color: T.textDim, marginBottom: 8 }}>VISIT PATTERN</div>
        <Timeline visits={customer.visits} />
      </div>

      <div style={{ display: "flex", gap: 12 }}>
        {[["avg gap", ag !== null ? `${ag}d` : "\u2014"], ["visits logged", customer.visits.length], ["rhythm", reg || "\u2014"]].map(([label, val], i) => (
          <div key={i} style={{ flex: 1, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 16, padding: 14, textAlign: "center" }}>
            <div style={{ fontFamily: i === 2 ? "'DM Sans', sans-serif" : "'Roboto Mono', monospace", fontWeight: 700, fontSize: i === 2 ? 13 : 19, color: T.text }}>{val}</div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.textDim, marginTop: 3 }}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CallLogSheet({ customer, close, logCall }) {
  const [days, setDays] = useState(3);
  const presets = [{ label: "Tomorrow", days: 1 }, { label: "2 days", days: 2 }, { label: "3 days", days: 3 }, { label: "1 week", days: 7 }];
  return (
    <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-end", zIndex: 30 }}>
      <div style={{ background: T.surface, width: "100%", borderRadius: "24px 24px 0 0", padding: "18px 18px 26px", border: `1px solid ${T.border}`, borderBottom: "none" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, color: T.text, fontSize: 16 }}>They said they'll come in\u2026</span>
          <button onClick={close} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={22} color={T.textDim} /></button>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
          {presets.map((p) => (
            <button key={p.days} onClick={() => setDays(p.days)} style={{ background: days === p.days ? T.blue : T.surfaceAlt, color: days === p.days ? "#0F1A2E" : T.text, border: `1px solid ${T.border}`, borderRadius: 999, padding: "10px 16px", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
              {p.label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 20, marginBottom: 20 }}>
          <button onClick={() => setDays((d) => Math.max(1, d - 1))} style={{ width: 44, height: 44, borderRadius: "50%", background: T.surfaceAlt, border: `1px solid ${T.border}`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Minus size={18} color={T.text} /></button>
          <div style={{ fontFamily: "'Roboto Mono', monospace", fontWeight: 700, fontSize: 26, color: T.text, minWidth: 86, textAlign: "center" }}>{days} {days === 1 ? "day" : "days"}</div>
          <button onClick={() => setDays((d) => Math.min(30, d + 1))} style={{ width: 44, height: 44, borderRadius: "50%", background: T.surfaceAlt, border: `1px solid ${T.border}`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Plus size={18} color={T.text} /></button>
        </div>
        <button onClick={() => { logCall(customer.id, days); close(); }} style={{ width: "100%", background: T.blue, border: "none", borderRadius: 14, padding: "15px 0", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer" }}>
          <Check size={20} color="#0F1A2E" />
          <span style={{ color: "#0F1A2E", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15 }}>Save</span>
        </button>
      </div>
    </div>
  );
}

function CustomersScreen({ customers, openCustomer }) {
  const order = { overdue: 0, dueSoon: 1, fresh: 2, onTrack: 3 };
  const sorted = [...customers].sort((a, b) => {
    const ka = Object.keys(STATUS).find((k) => STATUS[k] === statusFor(a.visits));
    const kb = Object.keys(STATUS).find((k) => STATUS[k] === statusFor(b.visits));
    return order[ka] - order[kb];
  });
  return (
    <div style={{ padding: "20px 16px 100px" }}>
      <div style={{ fontFamily: "'Roboto Slab', serif", fontWeight: 700, fontSize: 20, color: T.text, marginBottom: 4 }}>Customers</div>
      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: T.textDim, marginBottom: 18 }}>Visit rhythm, most overdue first.</div>
      {sorted.map((c) => {
        const status = statusFor(c.visits);
        const ag = avgGap(c.visits);
        return (
          <button key={c.id} onClick={() => openCustomer(c)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, padding: "10px 14px", marginBottom: 10, cursor: "pointer", textAlign: "left" }}>
            <Avatar c={c} size={42} ring={status.color} />
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: T.text }}>{c.name}</div>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.textDim }}>
                {ag !== null ? `usually every ${ag} days` : "new customer"} \u00b7 last seen {c.visits[0]}d ago
              </div>
            </div>
            {status === STATUS.overdue && <AlertCircle size={18} color={status.color} />}
          </button>
        );
      })}
    </div>
  );
}

function AddCustomerScreen() {
  return (
    <div style={{ padding: "20px 16px 100px", display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ fontFamily: "'Roboto Slab', serif", fontWeight: 700, fontSize: 20, color: T.text, marginBottom: 20 }}>New Customer</div>
      <button style={{ width: 104, height: 104, borderRadius: "50%", background: T.surface, border: `3px dashed ${T.gold}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", marginBottom: 24 }}>
        <Camera size={32} color={T.gold} />
      </button>
      <div style={{ width: "100%", maxWidth: 320, display: "flex", flexDirection: "column", gap: 12 }}>
        <button style={{ display: "flex", alignItems: "center", gap: 10, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, padding: "16px 14px", cursor: "pointer" }}>
          <Mic size={19} color={T.blue} />
          <span style={{ fontFamily: "'DM Sans', sans-serif", color: T.textDim }}>Record their shop name (voice)</span>
        </button>
        <button style={{ display: "flex", alignItems: "center", gap: 10, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, padding: "16px 14px", cursor: "pointer" }}>
          <Phone size={19} color={T.gold} />
          <span style={{ fontFamily: "'DM Sans', sans-serif", color: T.textDim }}>Phone number (for call reminders)</span>
        </button>
      </div>
    </div>
  );
}

export default function VisitTrackerPrototype() {
  const [mode, setMode] = useState("staff"); // "staff" | "pin" | "owner"
  const [ownerTab, setOwnerTab] = useState("followups");
  const [customers, setCustomers] = useState(initialCustomers);
  const [reminders, setReminders] = useState(initialReminders);
  const [activeCustomerId, setActiveCustomerId] = useState(null);
  const [justLogged, setJustLogged] = useState(null);
  const [sheetCustomer, setSheetCustomer] = useState(null);
  const [callSheetCustomer, setCallSheetCustomer] = useState(null);
  const [addReminderOpen, setAddReminderOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  const logVisit = (id, daysAgo) => {
    setCustomers((cs) => cs.map((c) => (c.id === id ? { ...c, visits: [...c.visits, daysAgo].sort((a, b) => a - b) } : c)));
    setJustLogged(id);
    setTimeout(() => setJustLogged(null), 900);
  };
  const logCall = (id, daysUntilPromised) => {
    setCustomers((cs) => cs.map((c) => (c.id === id ? { ...c, call: { calledDaysAgo: 0, daysUntilPromised } } : c)));
  };
  const addReminder = (customerId, dueInDays, note) => {
    setReminders((rs) => [...rs, { id: Date.now(), customerId, dueInDays, note }]);
  };
  const dismissReminder = (id) => setReminders((rs) => rs.filter((r) => r.id !== id));
  const openCustomer = (c) => { setActiveCustomerId(c.id); setDetailOpen(true); };

  const activeCustomer = customers.find((c) => c.id === activeCustomerId);

  return (
    <div style={{ maxWidth: 380, margin: "0 auto", height: 780, background: T.bg, position: "relative", overflow: "hidden", borderRadius: 28, border: `1px solid ${T.border}`, fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ height: "100%", overflowY: "auto" }}>
        {mode === "staff" && (
          <StaffHome customers={customers} logVisit={logVisit} justLogged={justLogged} openSheet={setSheetCustomer} requestOwnerMode={() => setMode("pin")} />
        )}
        {mode === "pin" && <PinGate back={() => setMode("staff")} unlock={() => { setMode("owner"); setDetailOpen(false); }} />}
        {mode === "owner" && !detailOpen && (
          <>
            {ownerTab === "followups" && (
              <FollowUpsScreen customers={customers} reminders={reminders} openCustomer={openCustomer} dismissReminder={dismissReminder} openAddReminder={() => setAddReminderOpen(true)} />
            )}
            {ownerTab === "customers" && <CustomersScreen customers={customers} openCustomer={openCustomer} />}
            {ownerTab === "add" && <AddCustomerScreen />}
          </>
        )}
        {mode === "owner" && detailOpen && activeCustomer && (
          <CustomerDetail customer={activeCustomer} back={() => setDetailOpen(false)} openCallSheet={setCallSheetCustomer} />
        )}
      </div>

      {sheetCustomer && <LogVisitSheet customer={sheetCustomer} close={() => setSheetCustomer(null)} logVisit={logVisit} />}
      {callSheetCustomer && <CallLogSheet customer={callSheetCustomer} close={() => setCallSheetCustomer(null)} logCall={logCall} />}
      {addReminderOpen && <AddReminderSheet customers={customers} close={() => setAddReminderOpen(false)} addReminder={addReminder} />}

      {mode === "owner" && !detailOpen && (
        <div style={{ position: "absolute", top: 14, left: 14, zIndex: 5 }}>
          <button onClick={() => setMode("staff")} style={{ display: "flex", alignItems: "center", gap: 6, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 999, padding: "6px 12px", cursor: "pointer" }}>
            <ArrowLeft size={14} color={T.textDim} />
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.textDim, fontWeight: 700 }}>Staff view</span>
          </button>
        </div>
      )}

      {mode === "owner" && !detailOpen && <OwnerNav tab={ownerTab} setTab={setOwnerTab} exit={() => setMode("staff")} />}
    </div>
  );
}
