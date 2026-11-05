import React, { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Check, Pencil, Plus, UserMinus, X } from "lucide-react";
import { T, tint } from "../theme.js";
import { sortList } from "../lib/lookups.js";

/**
 * One of the owner's short lists — marketing representatives, customer tiers.
 *
 * Kept as a list rather than letting the forms take free text: typed by hand,
 * one entry becomes three spellings and the counting these lists exist for
 * stops working.
 *
 * Taking an entry off the list does not unassign its customers. Those
 * retailers still belong to somebody until the owner says otherwise, and
 * silently emptying the field on forty rows because a rep left is the kind of
 * data loss nobody notices until a report is wrong.
 *
 * `ranked` adds the up/down controls: a tier list is an order, and the order
 * is the only part of it the app actually reads.
 */
export default function ManagedList({
  entries,
  actions,
  icon: Icon,
  noun,
  addLabel,
  ranked = false,
  intro,
  emptyText,
}) {
  const [adding, setAdding] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState(null);

  const rows = useMemo(() => sortList(entries), [entries]);
  const activeRows = rows.filter((e) => e.isActive);

  const submitNew = (e) => {
    e.preventDefault();
    const problem = actions.add(adding);
    setError(problem);
    if (!problem) setAdding("");
  };

  const startEdit = (entry) => {
    setEditingId(entry.id);
    setDraft(entry.name);
    setError(null);
  };

  const commitEdit = (id) => {
    const problem = actions.rename(id, draft);
    setError(problem);
    if (!problem) setEditingId(null);
  };

  const confirmRemove = (entry) => {
    const held = actions.countOf(entry.id);
    const message = held
      ? `Take ${entry.name} off the list?\n\n${held} ${held === 1 ? "customer stays" : "customers stay"} on it — ` +
        "you can reassign them afterwards from this screen."
      : `Take ${entry.name} off the list?`;
    if (window.confirm(message)) actions.remove(entry.id);
  };

  const confirmReassign = (entry) => {
    const held = actions.countOf(entry.id);
    if (!held) return;
    const others = activeRows.filter((e) => e.id !== entry.id);
    const names = others.map((e, i) => `${i + 1}. ${e.name}`).join("\n");
    const answer = window.prompt(
      `Move ${entry.name}'s ${held} ${held === 1 ? "customer" : "customers"} to:\n\n` +
        `${names}${names ? "\n" : ""}0. Nobody (leave unassigned)\n\nType a number:`,
      ""
    );
    if (answer === null) return;
    const choice = Number(answer.trim());
    if (!Number.isInteger(choice) || choice < 0 || choice > others.length) {
      setError("That wasn't one of the numbers on the list — nothing was moved.");
      return;
    }
    setError(null);
    actions.reassign(entry.id, choice === 0 ? null : others[choice - 1].id);
  };

  const field = {
    flex: 1,
    minWidth: 0,
    background: T.surfaceAlt,
    border: `1px solid ${T.border}`,
    borderRadius: 10,
    padding: "10px 12px",
    color: T.text,
    fontFamily: "'DM Sans', sans-serif",
    fontSize: 14,
    boxSizing: "border-box",
  };

  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 16, padding: 16, marginBottom: 10 }}>
      {intro && (
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: T.textDim, marginBottom: 14, lineHeight: 1.5 }}>
          {intro}
        </div>
      )}

      {rows.length === 0 && (
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: T.textDim, textAlign: "center", padding: "6px 0 14px" }}>
          {emptyText || "Nothing on the list yet."}
        </div>
      )}

      {rows.map((entry, i) => {
        const held = actions.countOf(entry.id);
        const editing = editingId === entry.id;
        const activeIndex = activeRows.findIndex((e) => e.id === entry.id);
        return (
          <div
            key={entry.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "9px 0",
              borderBottom: i === rows.length - 1 ? "none" : `1px solid ${T.border}`,
              opacity: entry.isActive ? 1 : 0.6,
            }}
          >
            {editing ? (
              <>
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitEdit(entry.id);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  style={field}
                  autoFocus
                  aria-label={`Rename ${entry.name}`}
                />
                <IconButton label="Save" icon={Check} color={T.green} onClick={() => commitEdit(entry.id)} />
                <IconButton label="Cancel" icon={X} onClick={() => setEditingId(null)} />
              </>
            ) : (
              <>
                <span
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    background: tint(T.gold, 0.16),
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    fontFamily: "'Roboto Mono', monospace",
                    fontWeight: 700,
                    fontSize: 12,
                    color: T.gold,
                  }}
                >
                  {ranked && entry.isActive ? entry.rank : <Icon size={15} color={T.gold} />}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: T.text }}>
                    {entry.name}
                    {!entry.isActive && <span style={{ fontWeight: 400, fontSize: 11, color: T.textDim }}> · removed</span>}
                    {ranked && entry.isActive && activeIndex === 0 && (
                      <span style={{ fontWeight: 400, fontSize: 11, color: T.textDim }}> · most important</span>
                    )}
                  </span>
                  <button
                    onClick={() => confirmReassign(entry)}
                    disabled={!held}
                    type="button"
                    style={{
                      background: "none",
                      border: "none",
                      padding: 0,
                      marginTop: 1,
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: 11,
                      color: held ? T.gold : T.textDim,
                      cursor: held ? "pointer" : "default",
                      textAlign: "left",
                    }}
                  >
                    {held} {held === 1 ? "customer" : "customers"}
                    {held > 0 && " · reassign"}
                  </button>
                </span>
                {ranked && entry.isActive && (
                  <>
                    <IconButton
                      label={`Move ${entry.name} up`}
                      icon={ArrowUp}
                      disabled={activeIndex === 0}
                      onClick={() => actions.move(entry.id, "up")}
                    />
                    <IconButton
                      label={`Move ${entry.name} down`}
                      icon={ArrowDown}
                      disabled={activeIndex === activeRows.length - 1}
                      onClick={() => actions.move(entry.id, "down")}
                    />
                  </>
                )}
                <IconButton label={`Rename ${entry.name}`} icon={Pencil} onClick={() => startEdit(entry)} />
                {entry.isActive && (
                  <IconButton label={`Remove ${entry.name}`} icon={UserMinus} color={T.red} onClick={() => confirmRemove(entry)} />
                )}
              </>
            )}
          </div>
        );
      })}

      <form onSubmit={submitNew} style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14 }}>
        <input
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          placeholder={addLabel || `Add a ${noun}`}
          style={field}
          autoComplete="off"
          aria-label={`New ${noun} name`}
        />
        <button
          type="submit"
          disabled={!adding.trim()}
          aria-label={`Add ${noun}`}
          style={{
            width: 38,
            height: 38,
            borderRadius: "50%",
            background: adding.trim() ? T.gold : T.surfaceAlt,
            border: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: adding.trim() ? "pointer" : "not-allowed",
            flexShrink: 0,
          }}
        >
          <Plus size={18} color={adding.trim() ? T.onGold : T.textDim} />
        </button>
      </form>

      {error && (
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.red, marginTop: 10, lineHeight: 1.5 }}>
          {error}
        </div>
      )}
    </div>
  );
}

function IconButton({ label, icon: Icon, onClick, color = T.textDim, disabled }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      type="button"
      disabled={disabled}
      style={{
        width: 32,
        height: 32,
        borderRadius: "50%",
        background: T.surfaceAlt,
        border: `1px solid ${T.border}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: disabled ? "default" : "pointer",
        flexShrink: 0,
        padding: 0,
        opacity: disabled ? 0.35 : 1,
      }}
    >
      <Icon size={14} color={color} />
    </button>
  );
}
