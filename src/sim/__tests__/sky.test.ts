/**
 * Stage 11 Part 1: the sky is scenery, and it is the same every time.
 */
import { describe, it, expect } from "vitest";
import { buildSky } from "../sky";
import skyData from "../../data/sky.json";
import { readFileSync } from "node:fs";

const css = readFileSync("src/styles.css", "utf8");

const W = 640;
const H = 400;

describe("the sky is built from a seed, so it never changes by itself", () => {
  it("the same seed gives exactly the same sky", () => {
    expect(buildSky(W, H)).toEqual(buildSky(W, H));
    expect(buildSky(W, H, 7)).toEqual(buildSky(W, H, 7));
  });

  it("a different seed gives a different sky", () => {
    const a = buildSky(W, H, skyData.seed);
    const b = buildSky(W, H, skyData.seed + 1);
    expect(a.stars).not.toEqual(b.stars);
    expect(a.stars.length).toBe(b.stars.length); // the same sky, differently arranged
  });

  it("the default seed is the one in sky.json", () => {
    expect(buildSky(W, H)).toEqual(buildSky(W, H, skyData.seed));
  });
});

describe("the sky keeps out of the mission's way", () => {
  const s = buildSky(W, H);

  it("has the number of stars sky.json asks for, all inside the picture", () => {
    expect(s.stars.length).toBe(skyData.stars.count);
    for (const star of s.stars) {
      expect(star.x).toBeGreaterThanOrEqual(0);
      expect(star.x).toBeLessThanOrEqual(W);
      expect(star.y).toBeGreaterThanOrEqual(0);
      expect(star.y).toBeLessThanOrEqual(H);
    }
  });

  it("never lets a star get as bright or as big as the rules allow the mission to be", () => {
    for (const star of s.stars) {
      expect(star.o).toBeLessThanOrEqual(skyData.stars.maxOpacity);
      expect(star.o).toBeGreaterThanOrEqual(skyData.stars.minOpacity);
      expect(star.r).toBeGreaterThanOrEqual(skyData.stars.minSize);
      expect(star.r).toBeLessThanOrEqual(skyData.stars.maxSize);
    }
    expect(skyData.stars.maxOpacity).toBeLessThanOrEqual(0.9);
    expect(s.band.opacity).toBeLessThanOrEqual(0.2);
  });

  it("packs more stars into the Milky Way band than outside it", () => {
    const angle = (s.band.angleDeg * Math.PI) / 180;
    const cx = W / 2;
    const cy = H / 2;
    // distance from the band's middle line, measured across the band
    const across = (star: { x: number; y: number }) =>
      Math.abs(-(star.x - cx) * Math.sin(angle) + (star.y - cy) * Math.cos(angle));
    const inBand = s.stars.filter((star) => across(star) <= s.band.width / 2).length;
    const bandShareOfPicture = s.band.width / H;
    expect(inBand / s.stars.length).toBeGreaterThan(bandShareOfPicture * 1.5);
  });

  it("puts galaxies and nebulae right out at the edges, away from the Sun and the orbits", () => {
    const cx = W / 2;
    const cy = H / 2;
    const keepOut = Math.max(W, H) * skyData.edge.keepOutRadiusShare;
    expect(s.galaxies.length).toBe(skyData.galaxies.count);
    expect(s.nebulae.length).toBe(skyData.nebulae.count);
    expect(s.galaxies.length + s.nebulae.length).toBeLessThanOrEqual(3); // "2 or 3 only"
    for (const far of [...s.galaxies, ...s.nebulae]) {
      expect(Math.hypot(far.x - cx, far.y - cy), `${far.x},${far.y}`).toBeGreaterThanOrEqual(keepOut);
      expect(far.o).toBeLessThanOrEqual(0.25);
    }
    // the widest orbit is 170 map units from the centre: nothing decorative comes near it
    for (const far of [...s.galaxies, ...s.nebulae]) {
      expect(Math.hypot(far.x - cx, far.y - cy)).toBeGreaterThan(170);
    }
  });

  it("grows with the map, so the space view is the same sky seen closer", () => {
    const big = buildSky(W * 2, H * 2);
    expect(big.stars.length).toBe(s.stars.length);
    expect(big.band.width).toBeCloseTo(s.band.width * 2, 6);
  });

  it("keeps twinkle off by default", () => {
    expect(skyData.twinkle.on).toBe(false);
    expect(skyData.twinkle.stars).toBeLessThanOrEqual(20);
  });
});

describe("a player who asked for less motion gets less motion", () => {
  
  /** Every rule inside a prefers-reduced-motion block, as one blob. */
  const reduced = css
    .split("@media (prefers-reduced-motion: reduce)")
    .slice(1)
    .map((block) => block.slice(0, block.indexOf("\n}")))
    .join("\n");

  it("turns off the twinkle, which is the only thing the sky can animate", () => {
    expect(css).toContain("sky-twinkle"); // the animation exists
    expect(skyData.twinkle.on).toBe(false); // and it is off by default anyway
    expect(reduced).toContain(".sky-star.twinkle");
    expect(reduced).toMatch(/\.sky-star\.twinkle\s*\{\s*animation:\s*none/);
  });

  it("has no parallax to turn off, because the stars never move at all", () => {
    // the sky is built once from a fixed seed and memoised on the map size: nothing in it follows the
    // spacecraft, which is also the truth about real stars (see the glossary entry)
    expect(css).not.toContain("parallax");
    const a = buildSky(W, H);
    const b = buildSky(W, H);
    expect(a.stars).toEqual(b.stars);
  });

  it("still lets the floating panels step aside, just without the fade", () => {
    expect(reduced).toContain(".space .gauges");
    expect(reduced).toMatch(/transition:\s*none/);
  });
});
