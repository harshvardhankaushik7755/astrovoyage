/**
 * Stage 12 Part 1: the sprite and the schematic, as they are actually drawn.
 *
 * The geometry is tested in src/sim/__tests__/shipLayout.test.ts. These tests are about what reaches
 * the screen: that every part carries the name of its group so a challenge can point at it, that the
 * picture stays small enough for the map and light enough for the frame rate, and that the schematic
 * is decoration a screen reader is never made to wade through.
 */
import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { ShipSprite, ShipSchematic } from "../Spacecraft";
import type { Design } from "../../physics/checks";

const CHEAP: Design = { bodyId: "small", instrumentIds: ["magnetometer"], powerId: "rtg", antennaId: "antSmall", engineId: "chemical", rocketId: "light", fuelKg: 800 };
const FAT: Design = { bodyId: "large", instrumentIds: ["camera", "radar", "magnetometer"], powerId: "solarLarge", antennaId: "antLarge", engineId: "ion", rocketId: "heavy", fuelKg: 3000 };

const sprite = (d: Design, heading?: number) => renderToString(<svg><ShipSprite design={d} heading={heading} /></svg>);
const schematic = (d: Design, highlight: Parameters<typeof ShipSchematic>[0]["highlight"] = null) =>
  renderToString(<ShipSchematic design={d} highlight={highlight} />);
const count = (svg: string, re: RegExp) => (svg.match(re) ?? []).length;
const elements = (svg: string) => count(svg, /<(circle|ellipse|rect|polygon|polyline|line|text|path)\b/g);

describe("the sprite on the map", () => {
  it("is built from parts, each one saying which group it belongs to", () => {
    const svg = sprite(FAT);
    for (const part of ["body", "power", "antenna", "instruments", "engine"]) {
      expect(svg, `${part} is missing from the sprite`).toContain(`data-part="${part}"`);
    }
  });

  it("draws the design the player bought and not a fixed picture", () => {
    expect(sprite(FAT)).toContain('data-shape="panel"');
    expect(sprite(CHEAP)).not.toContain('data-shape="panel"'); // a nuclear battery has no panels
    expect(sprite(CHEAP)).toContain('data-shape="rtg"');
    expect(count(sprite(FAT), /data-shape="sensor"/g)).toBe(3);
    expect(count(sprite(CHEAP), /data-shape="sensor"/g)).toBe(1);
    expect(sprite(FAT)).toContain('data-shape="grid"');       // ion
    expect(sprite(CHEAP)).toContain('data-shape="nozzle"');   // chemical
  });

  it("keeps the whole spacecraft under 40 drawn shapes, even the heaviest design", () => {
    expect(elements(sprite(FAT))).toBeLessThan(40);
    expect(elements(sprite(CHEAP))).toBeLessThan(40);
  });

  it("keeps the old class, so everything already written about the ship still finds it", () => {
    expect(sprite(CHEAP)).toContain('class="ship"');
  });

  it("points where it is going when it is given a heading, and leaves that to the map when it is not", () => {
    expect(sprite(CHEAP, 42)).toContain("rotate(42.0)");
    expect(sprite(CHEAP)).not.toContain("rotate(");
  });
});

describe("the schematic on the challenge card", () => {
  it("is hidden from a screen reader, because the option buttons are what the game reads", () => {
    expect(schematic(FAT)).toContain('aria-hidden="true"');
    expect(schematic(FAT)).toContain('focusable="false"');
  });

  it("marks the one part a challenge is happening to, and only that one", () => {
    const hit = schematic(FAT, "power");
    expect(count(hit, /class="part hit"/g)).toBe(2); // both wings are the power
    expect(count(schematic(FAT, "antenna"), /class="part hit"/g)).toBe(2); // the dish and its mast
    expect(count(schematic(FAT, null), /class="part hit"/g)).toBe(0);
  });

  it("can highlight every group a challenge is allowed to name", () => {
    for (const part of ["body", "power", "antenna", "instruments", "engine"] as const) {
      expect(count(schematic(FAT, part), /class="part hit"/g), `${part} cannot be highlighted`).toBeGreaterThan(0);
    }
  });

  it("stands the spacecraft nose up, so it reads as a portrait of the machine", () => {
    expect(schematic(CHEAP)).toContain("rotate(-90)");
  });
});
