import React from "react";
import { T } from "../theme.js";

export default function Avatar({ customer, size = 64, ring = T.border }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: T.surfaceAlt,
        border: `3px solid ${ring}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Roboto Slab', serif",
        fontWeight: 700,
        fontSize: size * 0.32,
        color: T.text,
        flexShrink: 0,
        boxSizing: "border-box",
      }}
    >
      {customer.initials}
    </div>
  );
}
