/**
 * Stage 10 Part 3: the three chips that say how hard a mission is, worked out from the scenario.
 */
import { describe, it, expect } from "vitest";
import scenarios from "../../data/scenarios.json";
import { missionChips, signalDelayMinutes, sunlightFraction } from "../missionFacts";
import { findScenario } from "../checks";
import { LIGHT_MINUTES_PER_AU } from "../comms";

const MOON = findScenario("moon");
const MARS = findScenario("mars");
const JUPITER = findScenario("jupiter");
const chip = (scenario: typeof MOON, id: string) => missionChips(scenario).find((c) => c.id === id)!;

describe("every mission gets exactly three chips", () => {
  it.each(scenarios.map((s) => [s.id, s] as const))("%s has sunlight, signal and launch window", (_id, sc) => {
    const chips = missionChips(sc);
    expect(chips.map((c) => c.id)).toEqual(["sunlight", "signal", "window"]);
    for (const c of chips) {
      expect(c.label.length).toBeGreaterThan(5);
      expect(["gain", "risk", "loss"]).toContain(c.tone);
      expect(c.help.length).toBeGreaterThan(20);
    }
  });
});

describe("sunlight comes from the inverse-square rule", () => {
  it("is 100% at Earth's distance and collapses further out", () => {
    expect(sunlightFraction(MOON)).toBeCloseTo(1, 6);
    expect(sunlightFraction(MARS)).toBeCloseTo(1 / (1.52 * 1.52), 6);
    expect(chip(MOON, "sunlight").label).toBe("Sunlight: 100%");
    expect(chip(MARS, "sunlight").label).toBe("Sunlight: 43%");
    expect(chip(JUPITER, "sunlight").label).toBe("Sunlight: 3.7%"); // a decimal, because 4% would hide the problem
  });
});

describe("signal delay is real light time, and the Moon is measured from Earth", () => {
  it("gives seconds for the Moon and minutes for the planets", () => {
    // 384,400 km is 1.28 light seconds: the Moon trip is Earth-centred, so its orbit radius IS the distance
    expect(signalDelayMinutes(MOON)).toBeCloseTo(MOON.targetOrbitRadiusAU * LIGHT_MINUTES_PER_AU, 9);
    expect(chip(MOON, "signal").label).toBe("Signal: 1.3 seconds");
    expect(chip(MARS, "signal").label).toBe("Signal: 13 minutes");
    expect(chip(JUPITER, "signal").label).toBe("Signal: 43 minutes");
    expect(chip(MOON, "signal").label).toMatch(/seconds/);
    expect(chip(JUPITER, "signal").label).toMatch(/minutes/);
  });
});

describe("the launch window says how often you can leave", () => {
  it("reads the scenario, not the mission name", () => {
    expect(chip(MOON, "window").label).toBe("Launch: any month");
    expect(chip(MARS, "window").label).toBe("Launch: every 26 months");
    expect(chip(JUPITER, "window").label).toBe("Launch: every 13 months");
  });
});

describe("the colour follows the value, not the scenario", () => {
  it("green at the easy end, amber in the middle, red at the hard end", () => {
    expect(chip(MOON, "sunlight").tone).toBe("gain");
    expect(chip(MARS, "sunlight").tone).toBe("risk");
    expect(chip(JUPITER, "sunlight").tone).toBe("loss");

    expect(chip(MOON, "signal").tone).toBe("gain");
    expect(chip(MARS, "signal").tone).toBe("risk");
    expect(chip(JUPITER, "signal").tone).toBe("loss");

    // Jupiter's window is easier than Mars's, and the colours say so even though Jupiter is the hard mission
    expect(chip(MOON, "window").tone).toBe("gain");
    expect(chip(JUPITER, "window").tone).toBe("risk");
    expect(chip(MARS, "window").tone).toBe("loss");
  });

  it("a made-up scenario gets its colours from its own numbers", () => {
    const easy = { ...JUPITER, id: "test", distanceAU: 1, targetOrbitRadiusAU: 0.002, windowMonths: 0 };
    expect(missionChips(easy).map((c) => c.tone)).toEqual(["gain", "gain", "gain"]);
    const hard = { ...MOON, id: "test", distanceAU: 9, targetOrbitRadiusAU: 9, windowMonths: 40 };
    expect(missionChips(hard).map((c) => c.tone)).toEqual(["loss", "loss", "loss"]);
  });
});
