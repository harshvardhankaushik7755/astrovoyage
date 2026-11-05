/**
 * The decorative sky behind the flight map (Stage 11 Part 1), worked out once from a fixed seed.
 *
 * Every position, size and opacity comes from the same seeded generator the missions use, so the sky is
 * identical on every run, in every screenshot and in every test. Nothing here knows about the mission:
 * it is scenery, and Part 2's rule is that scenery never competes with the mission objects.
 *
 * All the tunable numbers live in src/data/sky.json.
 */
import sky from "../data/sky.json";
import { nextRandom } from "./simulation";

export type Tint = "blue" | "amber" | null;
export interface Star { x: number; y: number; r: number; o: number; tint: Tint }
export interface Galaxy { x: number; y: number; rx: number; ry: number; angle: number; o: number }
export interface Nebula { x: number; y: number; r: number; o: number }
export interface Sky {
  stars: Star[];
  galaxies: Galaxy[];
  nebulae: Nebula[];
  band: { angleDeg: number; width: number; opacity: number };
  viewW: number;
  viewH: number;
}

/** A seeded stream of numbers, so the same seed always paints the same sky. */
function stream(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    const r = nextRandom(state);
    state = r.state;
    return r.value;
  };
  return {
    /** A number between `from` and `to`. */
    between: (from: number, to: number) => from + next() * (to - from),
    /** True with this chance. */
    chance: (p: number) => next() < p,
  };
}

/**
 * Build the sky for a map of this size.
 * The Milky Way is a band across the picture: stars inside it are packed closer together, which is what
 * makes it read as a band rather than a stripe, since the band itself is only a faint wash.
 */
export function buildSky(viewW: number, viewH: number, seed: number = sky.seed): Sky {
  const rnd = stream(seed);
  const cx = viewW / 2;
  const cy = viewH / 2;
  const angle = (sky.milkyWay.angleDeg * Math.PI) / 180;
  const bandWidth = viewH * sky.milkyWay.widthShare;

  const stars: Star[] = [];
  for (let i = 0; i < sky.stars.count; i++) {
    const inBand = rnd.chance(sky.stars.shareInBand);
    let x: number;
    let y: number;
    if (inBand) {
      // somewhere along the band, close to its middle line
      const along = rnd.between(-0.75, 0.75) * viewW;
      const across = (rnd.between(-1, 1) + rnd.between(-1, 1)) * 0.5 * bandWidth;
      x = cx + along * Math.cos(angle) - across * Math.sin(angle);
      y = cy + along * Math.sin(angle) + across * Math.cos(angle);
    } else {
      x = rnd.between(0, viewW);
      y = rnd.between(0, viewH);
    }
    if (x < 0 || x > viewW || y < 0 || y > viewH) {
      // a band star that fell outside the picture is simply placed anywhere, so the count is exact
      x = rnd.between(0, viewW);
      y = rnd.between(0, viewH);
    }
    const tint: Tint = rnd.chance(sky.stars.tintChance) ? (rnd.chance(0.5) ? "blue" : "amber") : null;
    stars.push({
      x: round(x),
      y: round(y),
      r: round(rnd.between(sky.stars.minSize, sky.stars.maxSize)),
      o: round(Math.min(sky.stars.maxOpacity, rnd.between(sky.stars.minOpacity, sky.stars.maxOpacity))),
      tint,
    });
  }

  // Galaxies and nebulae sit out in the corners, well outside the widest orbit, so they can never be
  // mistaken for something in the solar system the player is flying through. Each one takes a different
  // corner, so they never pile up in the same patch of sky however the seed falls.
  const m = sky.edge.marginShare;
  const corners = [
    { x: [m, sky.edge.cornerShare], y: [m, sky.edge.cornerShare] },
    { x: [1 - sky.edge.cornerShare, 1 - m], y: [m, sky.edge.cornerShare] },
    { x: [1 - sky.edge.cornerShare, 1 - m], y: [1 - sky.edge.cornerShare, 1 - m] },
    { x: [m, sky.edge.cornerShare], y: [1 - sky.edge.cornerShare, 1 - m] },
  ];
  let placed = 0;
  const edgePoint = () => {
    const corner = corners[placed++ % corners.length];
    return {
      x: round(rnd.between(viewW * corner.x[0], viewW * corner.x[1])),
      y: round(rnd.between(viewH * corner.y[0], viewH * corner.y[1])),
    };
  };

  const galaxies: Galaxy[] = [];
  for (let i = 0; i < sky.galaxies.count; i++) {
    const p = edgePoint();
    const rx = round(rnd.between(sky.galaxies.minRadius, sky.galaxies.maxRadius));
    galaxies.push({ ...p, rx, ry: round(rx * rnd.between(0.3, 0.55)), angle: round(rnd.between(-70, 70)), o: sky.galaxies.opacity });
  }

  const nebulae: Nebula[] = [];
  for (let i = 0; i < sky.nebulae.count; i++) {
    const p = edgePoint();
    nebulae.push({ ...p, r: round(rnd.between(sky.nebulae.minRadius, sky.nebulae.maxRadius)), o: sky.nebulae.opacity });
  }

  return {
    stars,
    galaxies,
    nebulae,
    band: { angleDeg: sky.milkyWay.angleDeg, width: round(bandWidth), opacity: sky.milkyWay.opacity },
    viewW,
    viewH,
  };
}

/** Two decimals is plenty for a star, and it keeps the rendered SVG identical between runs. */
const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Which floating panels the spacecraft is currently flying under (Stage 11 Part 3).
 *
 * In space view the map fills the screen and the panels sit on top of it, so the spacecraft can pass
 * behind one. The panel fades rather than the spacecraft, because the spacecraft is the mission and the
 * panel is furniture. The zones are fractions of the map, which is how the panels are placed in CSS.
 */
export interface PanelsHidingShip { topLeft: boolean; topRight: boolean; hud: boolean }
export const NOTHING_HIDDEN: PanelsHidingShip = { topLeft: false, topRight: false, hud: false };

/** The patch of map each panel sits over, in fractions, because that is how CSS places them. */
const zones = {
  topLeft: (x: number, y: number) => x < 0.44 && y < 0.24,
  topRight: (x: number, y: number) => x > 0.64 && y < 0.34,
  hud: (_x: number, y: number) => y > 0.86,
};

export function panelsUnderShip(ship: { x: number; y: number }, viewW: number, viewH: number): PanelsHidingShip {
  const x = ship.x / viewW;
  const y = ship.y / viewH;
  return { topLeft: zones.topLeft(x, y), topRight: zones.topRight(x, y), hud: zones.hud(x, y) };
}

/**
 * The same question asked for everything that matters: the spacecraft, the target and the Sun.
 * A panel over any of them steps aside, because those three are the mission and a panel is furniture.
 */
export function panelsOverMission(
  g: { ship: { x: number; y: number }; target: { x: number; y: number }; sun: { x: number; y: number } | null },
  viewW: number,
  viewH: number,
): PanelsHidingShip {
  const points = [g.ship, g.target, ...(g.sun ? [g.sun] : [])];
  const any = (zone: (x: number, y: number) => boolean) => points.some((p) => zone(p.x / viewW, p.y / viewH));
  return { topLeft: any(zones.topLeft), topRight: any(zones.topRight), hud: any(zones.hud) };
}
