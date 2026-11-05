/**
 * Stage 11 Part 5: the floating panels stay readable over the brightest part of the sky.
 *
 * The rule the stage sets is that if the contrast fails we raise the scrim, never lower the stars, so
 * this test computes the real ratio from the real values: the panel colour out of styles.css, the sky
 * out of sky.json. Eyeballing a translucent panel over a Milky Way is exactly the thing eyes are bad at.
 */
import { describe, it, expect } from "vitest";
import sky from "../../data/sky.json";
import { readFileSync } from "node:fs";

const css = readFileSync("src/styles.css", "utf8");



type Rgb = [number, number, number];
const hex = (h: string): Rgb => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
/** Paint a colour with some alpha on top of another, the way a browser does. */
const over = (top: Rgb, alpha: number, bottom: Rgb): Rgb =>
  top.map((c, i) => c * alpha + bottom[i] * (1 - alpha)) as Rgb;

/** WCAG relative luminance and contrast ratio. */
function luminance([r, g, b]: Rgb): number {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** The panel background the game really uses, taken from the stylesheet. */
function panelColour(): { rgb: Rgb; alpha: number } {
  // the @supports block is the see-through one, so it is the harder case of the two
  const block = css.slice(css.indexOf("@supports (backdrop-filter"));
  const m = block.match(/background: rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/)!;
  return { rgb: [Number(m[1]), Number(m[2]), Number(m[3])], alpha: Number(m[4]) };
}

/** The brightest the sky can be under a panel: the middle of the Milky Way band over the map's black. */
function brightestSky(): Rgb {
  const space = hex("#05070f"); // .space .map background
  const band = over(hex(sky.milkyWay.color), sky.milkyWay.peakAlpha * sky.milkyWay.opacity, space);
  // a star may sit there too, at its brightest
  return over(hex(sky.starColor), sky.stars.maxOpacity, band);
}

/** A colour the stylesheet names for the panels, so the test and the game can never disagree. */
const cssVar = (name: string): Rgb => {
  const found = css.match(new RegExp(name + "\\s*:\\s*(#[0-9a-f]{6})", "i"));
  if (!found) throw new Error(`styles.css does not define ${name}`);
  return hex(found[1]);
};

describe("floating panels over the brightest sky", () => {
  const text = cssVar("--hud-text");
  const dim = cssVar("--hud-text-dim");
  const panel = panelColour();

  it("the HUD text passes WCAG AA over the Milky Way", () => {
    const behind = over(hex(sky.milkyWay.color), sky.milkyWay.peakAlpha * sky.milkyWay.opacity, hex("#05070f"));
    const background = over(panel.rgb, panel.alpha, behind);
    const ratio = contrast(text, background);
    expect(ratio, `contrast was ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  });

  it("it still passes with the brightest possible star directly behind it", () => {
    const background = over(panel.rgb, panel.alpha, brightestSky());
    const ratio = contrast(text, background);
    expect(ratio, `contrast was ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  });

  it("the dimmer text in those panels passes too, because the HUD uses both", () => {
    const background = over(panel.rgb, panel.alpha, brightestSky());
    const ratio = contrast(dim, background);
    expect(ratio, `contrast was ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  });

  it("the fallback panel, for a browser with no backdrop-filter, is at least as dark", () => {
    const fallback = css.match(/\.space \.log \{[^}]*\}/)!; // the shared rule sits above it
    expect(fallback).toBeTruthy();
    const shared = css.match(/background: rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\);\s*\n\s*border: 1px solid/)!;
    expect(Number(shared[4]), "the no-blur fallback must be more opaque, not less").toBeGreaterThanOrEqual(panel.alpha);
  });
});
