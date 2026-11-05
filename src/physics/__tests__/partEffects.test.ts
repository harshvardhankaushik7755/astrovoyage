/**
 * Stage 10 Part 1: the line under every part card says what that part does for THIS mission.
 * Each line is worked out from the physics, so the same part reads differently at the Moon and at Jupiter.
 */
import { describe, it, expect } from "vitest";
import parts from "../../data/parts.json";
import {
  rocketEffect, bodyEffect, instrumentEffect, powerEffect, antennaEffect, engineEffect,
} from "../partEffects";
import { findScenario, getAntenna, getBody, getEngine, getInstrument, getPower, getRocket, runChecks, type Design } from "../checks";
import { powerMade } from "../power";
import { fuelNeeded } from "../rocketEquation";
import { dataReturnedFraction } from "../comms";

const MOON = findScenario("moon");
const MARS = findScenario("mars");
const JUPITER = findScenario("jupiter");
const BASE: Design = { bodyId: "small", instrumentIds: ["camera"], powerId: "solarSmall", antennaId: "antSmall", engineId: "chemical", rocketId: "medium", fuelKg: 1000 };

describe("rockets say what they can lift", () => {
  it("names the real capacity of each rocket", () => {
    for (const r of parts.rockets) {
      expect(rocketEffect(r)).toBe(`Can lift ${r.capacity.toLocaleString()} kg into space`);
    }
    expect(rocketEffect(getRocket("light"))).toContain("2,200 kg");
    // a rocket too small for the design still states the plain fact, never a warning
    expect(rocketEffect(getRocket("light"))).not.toMatch(/⚠|too|not enough/i);
  });
});

describe("bodies say how much room they have, and what protects you", () => {
  it("counts the slots and names backup systems only on the bus that has them", () => {
    for (const b of parts.bodies) {
      expect(bodyEffect(b)).toContain(`Room for ${b.slots} instrument`);
      expect(bodyEffect(b).includes("backup systems")).toBe(b.backup === true);
    }
    expect(bodyEffect(getBody("large"))).toContain("protects you from a solar storm");
    expect(bodyEffect({ slots: 1 })).toBe("Room for 1 instrument");
  });
});

describe("instruments say what they add and what they cost to run", () => {
  it("uses the numbers from the parts file", () => {
    for (const i of parts.instruments) {
      expect(instrumentEffect(i)).toBe(`Adds ${i.science} science points, needs ${i.power} W`);
    }
    expect(instrumentEffect(getInstrument("radar"))).toBe("Adds 30 science points, needs 120 W");
  });
});

describe("power says what it really makes at the target", () => {
  it("sunlight fades with distance, exactly as the inverse-square rule says", () => {
    const panels = getPower("solarLarge");
    const moon = powerEffect(panels, MOON);
    const mars = powerEffect(panels, MARS);
    const jupiter = powerEffect(panels, JUPITER);
    expect(moon).not.toBe(mars);
    expect(mars).not.toBe(jupiter);
    expect(moon).toBe(`Makes about ${Math.round(powerMade(panels, MOON.distanceAU))} W at the Moon`);
    expect(jupiter).toBe(`Makes about ${Math.round(powerMade(panels, JUPITER.distanceAU))} W at Jupiter`);
    // the Moon reads as a place, not a label: "at the Moon", the way the rest of the game says it
    expect(moon).toContain("at the Moon");
    expect(moon).not.toContain("at Moon");
    expect(powerEffect(getPower("solarSmall"), MARS)).toContain("at Mars");
    // the number really collapses far from the Sun: that is the lesson of the card
    const at = (s: typeof MOON) => Number(powerEffect(panels, s).match(/(\d+) W/)![1]);
    expect(at(MOON)).toBeGreaterThan(at(MARS));
    expect(at(MARS)).toBeGreaterThan(at(JUPITER) * 5);
  });

  it("a nuclear battery says the same thing everywhere, because it is true", () => {
    const rtg = getPower("rtg");
    expect(powerEffect(rtg, MOON)).toBe(powerEffect(rtg, JUPITER));
    expect(powerEffect(rtg, JUPITER)).toBe(`Makes ${rtg.powerAt1AU} W anywhere. Sunlight does not matter.`);
  });
});

describe("antennas say how much science gets home", () => {
  it("says where the choice would matter when it makes no difference here", () => {
    const small = getAntenna("antSmall");
    const large = getAntenna("antLarge");
    // on the tutorial mission every antenna gets everything home, so the line would teach nothing
    expect(Math.round(dataReturnedFraction(small.dataRate, MOON.commsFactor, 2) * 100)).toBe(100);
    expect(Math.round(dataReturnedFraction(large.dataRate, MOON.commsFactor, 2) * 100)).toBe(100);

    const line = antennaEffect(small, BASE, MOON);
    expect(line).toBe("About 100% here — but only about 10% at Jupiter");
    // the comparison is the real number for THIS antenna on the hardest mission, not a fixed sentence
    expect(line).toContain(`${Math.round(dataReturnedFraction(small.dataRate, JUPITER.commsFactor, 2) * 100)}% at Jupiter`);

    // the big dish keeps everything home even at Jupiter, so there is nothing to warn about
    expect(antennaEffect(large, BASE, MOON)).toBe("About 100% of your science reaches Earth");
    // and the two cards now read differently, which is the point
    expect(antennaEffect(small, BASE, MOON)).not.toBe(antennaEffect(large, BASE, MOON));

    // the design the tutorial actually loads: both antennas read 100% here, and both say what they
    // would manage at Jupiter, so the two cards teach the difference instead of looking identical
    const preset = findScenario("moon").preset;
    const tutorial: Design = { ...BASE, instrumentIds: preset.instrumentIds };
    expect(antennaEffect(small, tutorial, MOON)).toBe("About 100% here — but only about 7% at Jupiter");
    expect(antennaEffect(large, tutorial, MOON)).toBe("About 100% here — but only about 67% at Jupiter");

    // where the antennas already differ, the plain line stands
    expect(antennaEffect(small, BASE, JUPITER)).toBe("About 10% of your science reaches Earth");
    expect(antennaEffect(large, BASE, JUPITER)).toBe("About 100% of your science reaches Earth");
    // and on the hardest mission itself there is nowhere harder to point at
    const heavy: Design = { ...BASE, bodyId: "large", instrumentIds: ["camera", "radar", "spectrometer"] };
    expect(antennaEffect(small, heavy, JUPITER)).not.toContain("but only about");
  });

  it("falls with the distance to the target, and rises with a bigger dish", () => {
    const small = getAntenna("antSmall");
    const large = getAntenna("antLarge");
    const pct = (text: string) => Number(text.match(/(\d+)%/)![1]);
    // close to home everything gets through, whatever the dish
    expect(pct(antennaEffect(small, BASE, MOON))).toBe(100);
    // far away the dish is what decides how much science is worth anything
    expect(pct(antennaEffect(small, BASE, JUPITER))).toBeLessThan(pct(antennaEffect(large, BASE, JUPITER)));
    expect(pct(antennaEffect(small, BASE, MARS))).toBeGreaterThan(pct(antennaEffect(small, BASE, JUPITER)));
    // and it answers for the instruments actually on board: more data, less of it home
    const heavy: Design = { ...BASE, instrumentIds: ["camera", "radar", "spectrometer"], bodyId: "large" };
    expect(pct(antennaEffect(large, heavy, JUPITER))).toBeLessThan(pct(antennaEffect(large, BASE, JUPITER)));
    expect(pct(antennaEffect(large, heavy, MARS))).toBeGreaterThan(pct(antennaEffect(large, heavy, JUPITER)));
  });
});

describe("engines say how much fuel this trip would need", () => {
  it("answers for the scenario, the route and the mass of the rest of the design", () => {
    const chemical = getEngine("chemical");
    const ion = getEngine("ion");
    const moon = engineEffect(chemical, BASE, MOON, 3, "slow");
    const mars = engineEffect(chemical, BASE, MARS, 10, "slow");
    const fuel = (text: string) => Number(text.match(/about ([\d,]+) kg/)![1].replace(/,/g, ""));
    expect(fuel(mars)).toBeGreaterThan(fuel(moon)); // further away, more speed to change, more fuel

    // the ion engine sips fuel but wants power all the way
    expect(fuel(engineEffect(ion, BASE, MARS, 10, "slow"))).toBeLessThan(fuel(mars));
    expect(engineEffect(ion, BASE, MARS, 10, "slow")).toContain(`${ion.powerNeed} W of power the whole way`);
    expect(engineEffect(chemical, BASE, MARS, 10, "slow")).not.toContain("power the whole way");

    // heavier spacecraft, more fuel, worked out with the rocket equation
    const heavy: Design = { ...BASE, bodyId: "large", instrumentIds: ["camera", "radar", "spectrometer"] };
    expect(fuel(engineEffect(chemical, heavy, MARS, 10, "slow"))).toBeGreaterThan(fuel(mars));
    expect(engineEffect(chemical, BASE, MARS, 10, "slow")).not.toMatch(/day|month|year/i); // never a travel time
  });

  it("matches the rocket equation exactly, not an approximation of it", () => {
    const chemical = getEngine("chemical");
    const shown = Number(engineEffect(chemical, BASE, MARS, 10, "slow").match(/about ([\d,]+) kg/)![1].replace(/,/g, ""));
    // the same dry mass and the same Δv the Mission check panel works from
    const { dryMassKg, dvNeededKmS } = runChecks({ ...BASE, engineId: "chemical" }, MARS, 10, "slow");
    expect(shown).toBe(Math.round(fuelNeeded(chemical.isp, dryMassKg, dvNeededKmS)));
  });
});
