/**
 * Stage 12 Part 1: the spacecraft on screen is the one the player built.
 *
 * The reviewer's own test is to build a cheap little probe and a fat one and look at the map: if they
 * look the same, this has not landed. These are that test written down — every part group that can be
 * chosen differently has to come out visibly different.
 */
import { describe, it, expect } from "vitest";
import { shipLayout, spriteHaloRadius, spriteScale, spriteTailX, MAX_DRAWN_INSTRUMENTS, type ShipPart } from "../shipLayout";
import ship from "../../data/ship.json";
import parts from "../../data/parts.json";
import type { Design } from "../../physics/checks";

const BASE: Design = { bodyId: "small", instrumentIds: ["camera"], powerId: "solarSmall", antennaId: "antSmall", engineId: "chemical", rocketId: "light", fuelKg: 800 };
const with_ = (over: Partial<Design>): Design => ({ ...BASE, ...over });
/** The area a part group takes up on the drawing. */
const area = (design: Design, part: ShipPart) =>
  shipLayout(design).pieces.filter((p) => p.part === part).reduce((sum, p) => sum + p.w * p.h, 0);
const shapes = (design: Design, shape: string) => shipLayout(design).pieces.filter((p) => p.shape === shape);

describe("a bigger part is drawn bigger", () => {
  it("draws a large bus bigger than a medium one, and a medium one bigger than a small one", () => {
    const small = area(with_({ bodyId: "small" }), "body");
    const medium = area(with_({ bodyId: "medium" }), "body");
    const large = area(with_({ bodyId: "large" }), "body");
    expect(medium).toBeGreaterThan(small);
    expect(large).toBeGreaterThan(medium);
    // the difference is one a player can see, not a couple of pixels
    expect(large / small).toBeGreaterThan(1.5);
  });

  it("draws large panels longer than small ones, because a panel's area is what makes the power", () => {
    const small = shapes(with_({ powerId: "solarSmall" }), "panel");
    const large = shapes(with_({ powerId: "solarLarge" }), "panel");
    expect(small).toHaveLength(2);
    expect(large).toHaveLength(2);
    expect(large[0].h).toBeGreaterThan(small[0].h * 1.8);
    // and the wings are one each side, not both on the same side
    expect(Math.sign(large[0].y)).toBe(-Math.sign(large[1].y));
  });

  it("gives a nuclear battery no panels at all, because it does not use sunlight", () => {
    const rtg = shipLayout(with_({ powerId: "rtg" }));
    expect(rtg.pieces.filter((p) => p.shape === "panel")).toHaveLength(0);
    expect(rtg.pieces.filter((p) => p.shape === "rtg")).toHaveLength(1);
    expect(area(with_({ powerId: "rtg" }), "power")).toBeLessThan(area(with_({ powerId: "solarSmall" }), "power"));
  });

  it("draws the big dish wider than the small one, by the square root of its data rate", () => {
    const small = shapes(with_({ antennaId: "antSmall" }), "dish")[0];
    const large = shapes(with_({ antennaId: "antLarge" }), "dish")[0];
    const rate = (id: string) => parts.antennas.find((a) => a.id === id)!.dataRate;
    expect(large.h).toBeGreaterThan(small.h);
    // ten times the data rate is a bit over three times the width, which is how dishes really work
    const expected = (2 * Math.sqrt(rate("antLarge")) * ship.dish.dataScale + ship.dish.rim) /
      (2 * Math.sqrt(rate("antSmall")) * ship.dish.dataScale + ship.dish.rim);
    expect(large.h / small.h).toBeCloseTo(expected, 6);
  });

  it("puts one sensor box on the bus for every instrument bought", () => {
    for (const ids of [["camera"], ["camera", "radar"], ["camera", "radar", "magnetometer"]]) {
      expect(shapes(with_({ instrumentIds: ids }), "sensor")).toHaveLength(ids.length);
    }
    // a heavier instrument is a bigger box
    const radar = shapes(with_({ instrumentIds: ["radar"] }), "sensor")[0];
    const magnetometer = shapes(with_({ instrumentIds: ["magnetometer"] }), "sensor")[0];
    expect(radar.w).toBeGreaterThan(magnetometer.w);
    // and every one of them is a part the player can name
    for (const s of shapes(with_({ instrumentIds: ["camera", "radar"] }), "sensor")) expect(s.name).toBeTruthy();
  });

  it("never draws more sensor boxes than there is room for on the bus", () => {
    const tooMany = with_({ bodyId: "large", instrumentIds: ["camera", "radar", "magnetometer", "weather", "spectrometer"] });
    expect(shapes(tooMany, "sensor")).toHaveLength(MAX_DRAWN_INSTRUMENTS);
  });

  it("gives an ion engine a longer grid and a chemical engine a nozzle", () => {
    const chemical = shipLayout(with_({ engineId: "chemical" })).pieces.find((p) => p.part === "engine")!;
    const ion = shipLayout(with_({ engineId: "ion" })).pieces.find((p) => p.part === "engine")!;
    expect(chemical.shape).toBe("nozzle");
    expect(ion.shape).toBe("grid");
    expect(ion.w).toBeGreaterThan(chemical.w);
  });
});

describe("the whole spacecraft", () => {
  const CHEAP = with_({ bodyId: "small", powerId: "rtg", antennaId: "antSmall", instrumentIds: ["magnetometer"] });
  const FAT: Design = with_({ bodyId: "large", powerId: "solarLarge", antennaId: "antLarge", instrumentIds: ["camera", "radar", "magnetometer"], engineId: "ion" });

  it("makes a cheap probe and a fat one look nothing like each other", () => {
    const cheap = shipLayout(CHEAP);
    const fat = shipLayout(FAT);
    expect(fat.w * fat.h).toBeGreaterThan(cheap.w * cheap.h * 4);
    expect(fat.pieces.length).toBeGreaterThan(cheap.pieces.length);
  });

  it("names every part group, so a challenge can point at the one it is happening to", () => {
    const groups = new Set(shipLayout(FAT).pieces.map((p) => p.part));
    expect([...groups].sort()).toEqual(["antenna", "body", "engine", "instruments", "power"]);
  });

  it("stays inside the sprite's size budget on the map, however big the design is", () => {
    for (const d of [CHEAP, FAT, BASE]) {
      const layout = shipLayout(d);
      const mapUnits = Math.max(layout.w, layout.h) * spriteScale(layout);
      expect(mapUnits).toBeLessThanOrEqual(ship.sprite.maxMapUnits);
    }
    // the map is 640 units wide and draws at about 733px on a 1366-wide laptop: 24 units is about 28px
    expect(ship.sprite.maxMapUnits * (733 / 640)).toBeLessThanOrEqual(28);
  });

  it("never draws a bigger design smaller, whatever the size budget does to the giants", () => {
    // one scale for everything, capped for the very largest: min(base * extent, cap) can only grow
    const drawn = (d: Design) => {
      const layout = shipLayout(d);
      return Math.max(layout.w, layout.h) * spriteScale(layout);
    };
    const ordered = [CHEAP, BASE, FAT];
    for (let i = 1; i < ordered.length; i++) expect(drawn(ordered[i])).toBeGreaterThanOrEqual(drawn(ordered[i - 1]));
    expect(drawn(CHEAP)).toBeLessThan(drawn(FAT)); // and the two ends are not the same drawing at all
  });

  it("gives the smallest probe a sprite big enough to see, and its glow no bigger than it needs", () => {
    const layout = shipLayout(CHEAP);
    expect(Math.max(layout.w, layout.h) * spriteScale(layout)).toBeGreaterThan(9); // about 12px on a laptop
    expect(spriteHaloRadius(CHEAP)).toBeLessThan(spriteHaloRadius(FAT));
  });

  it("puts the burn flame behind the engine, further back on a longer one", () => {
    expect(spriteTailX(BASE)).toBeLessThan(0);
    expect(spriteTailX(with_({ engineId: "ion" }))).toBeLessThan(spriteTailX(with_({ engineId: "chemical" })));
  });
});
