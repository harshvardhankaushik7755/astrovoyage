/**
 * The shape of the spacecraft the player actually built.
 *
 * Pure geometry, no React: a Design in, a list of pieces out, which the map sprite and the schematic
 * both draw. Every size comes from a real number in parts.json — a heavier bus is a bigger box, panels
 * that make more power are longer, a dish with ten times the data rate is wider — so two different
 * designs can never look the same. The scale factors that turn those numbers into ship units live in
 * src/data/ship.json, with nothing hard-coded here.
 *
 * The frame: +x is the nose, ±y are the sides, and every piece is a box given by its centre.
 */
import ship from "../data/ship.json";
import { getAntenna, getBody, getEngine, getInstrument, getPower, type Design } from "../physics/checks";

/** The part groups a challenge can hit, and the ones the schematic can highlight. */
export type ShipPart = "body" | "power" | "antenna" | "instruments" | "engine";
export type ShipShape = "bus" | "panel" | "rtg" | "dish" | "mast" | "sensor" | "nozzle" | "grid";

export interface ShipPiece {
  part: ShipPart;
  shape: ShipShape;
  /** centre of the box, in ship units */
  x: number;
  y: number;
  w: number;
  h: number;
  /** the part this piece is, for the ones the player picked one by one (instruments) */
  id?: string;
  /** what it is, in the player's words, for a caption on the schematic */
  name?: string;
}

export interface ShipLayout {
  pieces: ShipPiece[];
  /** the whole spacecraft's extent in ship units, nose to tail and wingtip to wingtip */
  w: number;
  h: number;
}

/** How many instruments fit on the picture. The bus itself never has room for more. */
export const MAX_DRAWN_INSTRUMENTS = 3;

export function shipLayout(design: Design): ShipLayout {
  const body = getBody(design.bodyId);
  const power = getPower(design.powerId);
  const antenna = getAntenna(design.antennaId);
  const engine = getEngine(design.engineId);
  const instruments = design.instrumentIds.slice(0, MAX_DRAWN_INSTRUMENTS).map(getInstrument);
  const pieces: ShipPiece[] = [];

  // the bus: a box sized by how much it weighs, so a 1000 kg bus is visibly the big one
  const busW = Math.cbrt(body.mass) * ship.bus.massScale;
  const busH = busW * ship.bus.aspect;
  pieces.push({ part: "body", shape: "bus", x: 0, y: 0, w: busW, h: busH, id: body.id, name: body.name });

  // power: two wings, or a nuclear battery and no wings at all
  if (power.type === "solar") {
    // a panel's area is what makes the power, so its length goes with the square root of the watts
    const len = Math.sqrt(power.powerAt1AU) * ship.panel.powerScale;
    const wingW = busW * ship.panel.widthShare;
    for (const side of [-1, 1]) {
      pieces.push({
        part: "power", shape: "panel", id: power.id, name: power.name,
        x: 0, y: side * (busH / 2 + ship.panel.gap + len / 2), w: wingW, h: len,
      });
    }
  } else {
    // an RTG makes its power from heat, not sunlight: a stubby canister sized by what it weighs
    const len = Math.cbrt(power.mass) * ship.rtg.massScale;
    const thick = len * ship.rtg.aspect;
    pieces.push({
      part: "power", shape: "rtg", id: power.id, name: power.name,
      x: 0, y: busH / 2 + ship.rtg.gap + thick / 2, w: len, h: thick,
    });
  }

  // the dish: a radio dish gathers by its area, so its width goes with the square root of the data rate
  const dishH = 2 * Math.sqrt(antenna.dataRate) * ship.dish.dataScale + ship.dish.rim;
  const dishW = dishH * ship.dish.depthShare;
  pieces.push({ part: "antenna", shape: "mast", x: busW / 2 + ship.dish.mast / 2, y: 0, w: ship.dish.mast, h: 1 });
  pieces.push({
    part: "antenna", shape: "dish", id: antenna.id, name: antenna.name,
    x: busW / 2 + ship.dish.mast + dishW / 2, y: 0, w: dishW, h: dishH,
  });

  // the instruments, one box each, sized by what they weigh and set along the front of the bus
  instruments.forEach((instr, i) => {
    const size = Math.max(ship.sensor.minSize, Math.cbrt(instr.mass) * ship.sensor.massScale);
    const step = busH / (instruments.length + 1);
    pieces.push({
      part: "instruments", shape: "sensor", id: instr.id, name: instr.name,
      x: busW / 2 - size * (0.5 - ship.sensor.outShare), y: -busH / 2 + step * (i + 1), w: size, h: size,
    });
  });

  // the engine: a short chemical nozzle, or the longer grid of an ion thruster
  const e = engine.burnProfile === "continuous" ? ship.engine.ion : ship.engine.chemical;
  pieces.push({
    part: "engine", shape: engine.burnProfile === "continuous" ? "grid" : "nozzle", id: engine.id, name: engine.name,
    x: -busW / 2 - e.length / 2, y: 0, w: e.length, h: e.mouth,
  });

  const right = Math.max(...pieces.map((p) => p.x + p.w / 2));
  const left = Math.min(...pieces.map((p) => p.x - p.w / 2));
  const top = Math.min(...pieces.map((p) => p.y - p.h / 2));
  const bottom = Math.max(...pieces.map((p) => p.y + p.h / 2));
  return { pieces, w: right - left, h: bottom - top };
}

/**
 * How many map units one ship unit is worth. One scale for every design, so a bigger spacecraft is a
 * bigger dot, with a cap for the very largest so no sprite can outgrow its budget on the map. The cap
 * only squeezes the giants, and it can never turn a bigger design into a smaller drawing.
 */
export function spriteScale(layout: ShipLayout): number {
  const fit = ship.sprite.maxMapUnits / Math.max(layout.w, layout.h);
  return Math.min(ship.sprite.mapUnitsPerShipUnit, fit);
}

/**
 * The player's own name for a part group, taken from what they bought: "Large dish antenna", not "the
 * antenna". Instruments can be several, so they are all named. No new words are invented here — every
 * one of these is the name in parts.json that the player chose in the Design Lab.
 */
export function partName(design: Design, part: ShipPart | null): string {
  if (!part) return "";
  const names = shipLayout(design).pieces.filter((p) => p.part === part && p.name).map((p) => p.name!);
  return [...new Set(names)].join(" · ");
}

/** The glow behind the sprite, so a spacecraft is never lost against a star — sized to the ship. */
export function spriteHaloRadius(design: Design): number {
  const layout = shipLayout(design);
  const drawn = Math.max(layout.w, layout.h) * spriteScale(layout);
  return Math.max(ship.sprite.minHaloMapUnits, drawn * ship.sprite.haloShare);
}

/** Where the engine ends, in map units, so the burn flame starts at the back of this ship and not inside it. */
export function spriteTailX(design: Design): number {
  const layout = shipLayout(design);
  const tail = Math.min(...layout.pieces.map((p) => p.x - p.w / 2));
  return tail * spriteScale(layout);
}
