import { useEffect, useState } from "react";

/**
 * How wide the app should lay itself out, and how much room to leave.
 *
 * The app began as a phone screen and still is one on a phone. But it is also
 * opened on an iPad on the counter and in a desktop browser in the back
 * office, where a 460px column stranded in the middle of a 1440px window
 * wastes most of the screen. So the shell grows, the gutters open up, and the
 * lists reflow into however many columns fit.
 *
 * Breakpoints are on the *window*, not the device: a browser dragged narrow on
 * a desktop should behave like a phone, because at that width it is one.
 */
export const BREAKPOINTS = { tablet: 700, desktop: 1100 };

/**
 * `maxWidth` caps the shell; `gutter` is the page's side padding; `cardMin` is
 * the narrowest a list card may get before the grid drops a column — set so a
 * phone always lands on exactly one.
 */
export function layoutFor(width) {
  if (width >= BREAKPOINTS.desktop) {
    return { bp: "desktop", maxWidth: 1200, gutter: 32, cardMin: 340, faceMin: 160, readable: 620 };
  }
  if (width >= BREAKPOINTS.tablet) {
    return { bp: "tablet", maxWidth: 860, gutter: 24, cardMin: 330, faceMin: 150, readable: 560 };
  }
  // No cap on a phone: the shell is the screen, minus whatever the notch takes.
  return { bp: "phone", maxWidth: 560, gutter: 16, cardMin: 280, faceMin: 140, readable: 460 };
}

const windowWidth = () => (typeof window === "undefined" ? 390 : window.innerWidth);

/**
 * The current layout, recomputed when the window changes.
 *
 * Deliberately a JS hook rather than CSS media queries: every style in this app
 * is an inline object, and threading a stylesheet through just for three
 * breakpoints would mean two places to look for any given rule.
 */
export function useLayout() {
  const [width, setWidth] = useState(windowWidth);

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    // Rotating a phone fires this before `innerWidth` settles on some browsers.
    window.addEventListener("orientationchange", onResize);
    onResize();
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

  return layoutFor(width);
}

/**
 * Page padding for a screen: side gutters, and room for the bottom nav.
 *
 * The nav grows by the home-indicator inset, so the space left for it has to
 * as well — a fixed figure that clears the bar on one iPhone leaves the last
 * row of a list half under it on another.
 */
export const screenPadding = (layout, { bottom = 110, top = 8 } = {}) => ({
  padding: bottom
    ? `${top}px ${layout.gutter}px calc(${bottom}px + var(--safe-bottom))`
    : `${top}px ${layout.gutter}px 0px`,
});

/**
 * A list that reflows into columns. On a phone `cardMin` is wider than the
 * column, so `min()` keeps it at exactly one and nothing overflows.
 */
export const cardGrid = (layout, { gap = 10, min = layout.cardMin } = {}) => ({
  display: "grid",
  gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${min}px), 1fr))`,
  gap,
  alignItems: "start",
});
