// ---- Design tokens (dark) ----
// Neutral near-black surfaces with one warm accent: the gold carries the trade,
// everything else stays out of the way so the status colours are the only hue
// competing for attention.
export const T = {
  bg: "#0E0F11",
  surface: "#17191D",
  surfaceAlt: "#212429",
  border: "#2C3036",
  text: "#F3F5F7",
  textDim: "#8A919B",
  gold: "#9FB3D1",
  goldDeep: "#7489A8",
  green: "#3DD68C",
  amber: "#F2B33D",
  red: "#FF6B6B",
  blue: "#5B9CFF",
  grey: "#868E99",
  // Text that sits *on* an accent fill. Tokenised because a hardcoded value in
  // fourteen places is what makes changing the accent a chore.
  onGold: "#14161A",
  onBlue: "#0B1220",
};

export const STATUS = {
  onTrack: { key: "onTrack", label: "On track", color: T.green },
  dueThisWeek: { key: "dueThisWeek", label: "Due this week", color: T.amber },
  missed: { key: "missed", label: "Missed", color: T.red },
  never: { key: "never", label: "Never visited", color: T.grey },
};

export function tint(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}
