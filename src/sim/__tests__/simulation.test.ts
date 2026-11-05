import { describe, it, expect } from "vitest";
import {
  createSimulation, step, planetAngle, transferPosition, transferPath, timeScale, formatSignalDelay,
  signalStrengthAt, signalDelayAt, ORBIT_TEXT, FAILED_TEXT, EARTH_ORBIT_DAYS, PARKING_ORBIT_AU,
  type SimState,
} from "../simulation";
import { runChecks, findScenario, type Design } from "../../physics/checks";
import type { Route } from "../../physics/windows";
import scenarios from "../../data/scenarios.json";
import parts from "../../data/parts.json";

const TAU = 2 * Math.PI;
const norm = (a: number) => ((a % TAU) + TAU) % TAU;

/** The sensible Moon design from physics.test.ts. */
const MOON_OK: Design = {
  bodyId: "small", instrumentIds: ["camera", "magnetometer"], powerId: "solarSmall",
  antennaId: "antSmall", engineId: "chemical", rocketId: "medium", fuelKg: 1400,
};

/** A Mars design with enough fuel for the trip AND the braking burn. */
const MARS_OK: Design = { bodyId: "small", instrumentIds: ["camera"], powerId: "solarSmall", antennaId: "antLarge", engineId: "chemical", rocketId: "medium", fuelKg: 2600 };

function start(design: Design, scenarioId: string, month = 3, route: Route = "slow"): SimState {
  const sc = findScenario(scenarioId);
  return createSimulation(design, sc, month, route, runChecks(design, sc, month, route), 1, []); // seed 1, no challenges
}

/** Step until the mission is over, the way the screen will. */
function flyToEnd(s: SimState, daysPerStep = 1): SimState {
  for (let i = 0; i < 100_000 && (s.phase === "cruise" || s.phase === "insertion"); i++) s = step(s, daysPerStep);
  return s;
}

function deepFreeze<T>(o: T): T {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o as object)) deepFreeze(v);
  }
  return o;
}

describe("orbit insertion", () => {
  it("(a) the sensible Moon design ends in orbit with fuel to spare", () => {
    const s0 = start(MOON_OK, "moon");
    const s = flyToEnd(s0);
    expect(s.phase).toBe("orbit");
    expect(s.missionDay).toBe(s.totalDays);
    expect(s.fuelKg).toBeGreaterThan(0);
    expect(s.fuelKg).toBeLessThan(MOON_OK.fuelKg);
    expect(s.scienceCollected).toBe(s.config.scienceTotal);
    expect(s.log[s.log.length - 1].text).toBe(ORBIT_TEXT);
  });

  it("(a) one big step reaches insertion; the next step settles into orbit", () => {
    const s0 = start(MOON_OK, "moon");
    const s1 = step(s0, s0.totalDays);
    expect(s1.phase).toBe("insertion");
    expect(s1.missionDay).toBe(s0.totalDays);
    expect(step(s1, 1).phase).toBe("orbit");
  });

  it("(b) too little fuel (the Design Lab would block this design): the spacecraft flies past", () => {
    const design = { ...MOON_OK, fuelKg: 700 };
    expect(runChecks(design, findScenario("moon"), 3, "slow").dv.ok).toBe(false);
    const s = flyToEnd(start(design, "moon"));
    expect(s.phase).toBe("failed");
    expect(s.fuelKg).toBe(0);
    expect(s.scienceCollected).toBe(0);
    expect(s.log[s.log.length - 1].text).toBe(FAILED_TEXT);
  });

  it("after orbit or failure, step() returns the same state", () => {
    const s = flyToEnd(start(MOON_OK, "moon"));
    expect(step(s, 10)).toBe(s);
  });

  it("a design that passes the launch checks reaches orbit, even with the bare minimum of fuel", () => {
    const marginal: Design = { bodyId: "small", instrumentIds: ["camera"], powerId: "solarSmall", antennaId: "antLarge", engineId: "chemical", rocketId: "light", fuelKg: 1550 };
    const sc = findScenario("mars");
    const check = runChecks(marginal, sc, 10, "slow");
    expect(check.allOk).toBe(true);
    expect(flyToEnd(createSimulation(marginal, sc, 10, "slow", check, 1, [])).phase).toBe("orbit");
    expect(flyToEnd(start({ ...MOON_OK, fuelKg: 800 }, "moon")).phase).toBe("orbit");
  });
});

describe("power and signal along the way", () => {
  it("(c) power at Jupiter is about 3.7% of power at Earth", () => {
    const s0 = start({ ...MOON_OK, powerId: "solarLarge", rocketId: "heavy", fuelKg: 4000 }, "jupiter", 4);
    expect(s0.powerW).toBeCloseTo(2800, 6);
    const arrived = step(s0, s0.totalDays);
    expect(arrived.distanceFromSunAU).toBeCloseTo(5.2, 6);
    expect(arrived.powerW / s0.powerW).toBeCloseTo(0.037, 3);
  });

  it("an RTG makes the same power everywhere", () => {
    const s0 = start({ ...MOON_OK, powerId: "rtg", rocketId: "heavy", fuelKg: 4000 }, "jupiter", 4);
    expect(step(s0, s0.totalDays).powerW).toBe(s0.powerW);
  });

  it("signal strength follows the inverse-square rule", () => {
    expect(signalStrengthAt(0)).toBe(1);
    expect(signalStrengthAt(1)).toBeCloseTo(0.25, 10);
    const s = step(start(MOON_OK, "mars", 10, "slow"), 100);
    expect(s.signalStrength).toBeCloseTo(signalStrengthAt(s.distanceFromEarthAU), 10);
  });

  it("the Moon is about 1.3 light-seconds away", () => {
    const s0 = start(MOON_OK, "moon");
    const s = step(s0, s0.totalDays);
    expect(s.signalDelayMinutes * 60).toBeCloseTo(1.28, 1);
    expect(formatSignalDelay(s.signalDelayMinutes)).toBe("1.3 seconds");
    expect(signalDelayAt(1)).toBeCloseTo(8.3, 1);
  });

  it("formats delays in plain words", () => {
    expect(formatSignalDelay(0.5)).toBe("30 seconds");
    expect(formatSignalDelay(1)).toBe("1 minute");
    expect(formatSignalDelay(12.4)).toBe("12 minutes");
    expect(formatSignalDelay(125)).toBe("2 hours 5 minutes");
  });
});

describe("flight path", () => {
  it("distance from Earth starts at zero and ends at the target", () => {
    const moon = start(MOON_OK, "moon");
    expect(moon.distanceFromEarthAU).toBeCloseTo(PARKING_ORBIT_AU, 8);
    expect(step(moon, moon.totalDays).distanceFromEarthAU).toBeCloseTo(findScenario("moon").targetOrbitRadiusAU, 6);

    const mars = start(MOON_OK, "mars", 10);
    expect(mars.distanceFromEarthAU).toBeCloseTo(0, 6);
    const arrived = step(mars, mars.totalDays);
    expect(arrived.distanceFromSunAU).toBeCloseTo(1.52, 6);
    expect(arrived.distanceFromEarthAU).toBeGreaterThan(0.5);
  });

  it("transferPosition: starts at r1 angle 0, ends at r2 angle 180°, moves faster near the inner body", () => {
    const a = transferPosition(0, 1, 1.52);
    expect(a.radiusAU).toBeCloseTo(1, 10);
    expect(a.angleRad).toBeCloseTo(0, 10);
    const b = transferPosition(1, 1, 1.52);
    expect(b.radiusAU).toBeCloseTo(1.52, 10);
    expect(b.angleRad).toBeCloseTo(Math.PI, 6);
    const mid = transferPosition(0.5, 1, 5.2);
    expect(mid.angleRad).toBeGreaterThan(Math.PI / 2);
    expect(mid.angleRad).toBeLessThan(Math.PI);
    // radius grows the whole way
    let last = 0;
    for (let f = 0; f <= 1; f += 0.05) {
      const r = transferPosition(f, 1, 5.2).radiusAU;
      expect(r).toBeGreaterThanOrEqual(last);
      last = r;
    }
  });

  it("planetAngle: Earth starts at the launch angle and the target waits 180° away on arrival day", () => {
    const mars = findScenario("mars");
    const T = 336;
    const depart = norm((TAU * 10) / 12);
    expect(planetAngle("earth", 0, 10, mars, T)).toBeCloseTo(depart, 10);
    expect(planetAngle("earth", EARTH_ORBIT_DAYS, 10, mars, T)).toBeCloseTo(depart, 10);
    expect(planetAngle("target", T, 10, mars, T)).toBeCloseTo(norm(depart + Math.PI), 10);
    // Mars moves 336/687 of a turn during the trip
    const moved = norm(planetAngle("target", T, 10, mars, T) - planetAngle("target", 0, 10, mars, T));
    expect(moved).toBeCloseTo((TAU * T) / 687, 10);
    // the Moon scenario is drawn around Earth, so Earth is the centre
    expect(planetAngle("earth", 2, 3, findScenario("moon"), 3)).toBe(0);
  });

  it("the state carries the same angles the screen would compute", () => {
    const s = step(start(MOON_OK, "mars", 10), 100);
    expect(s.earthAngleRad).toBeCloseTo(planetAngle("earth", 100, 10, s.config, s.totalDays), 10);
    expect(s.targetAngleRad).toBeCloseTo(planetAngle("target", 100, 10, s.config, s.totalDays), 10);
    const end = step(s, s.totalDays);
    expect(end.spacecraft.angleRad).toBeCloseTo(end.targetAngleRad, 6);
    expect(end.spacecraft.radiusAU).toBeCloseTo(1.52, 6);
  });
});

describe("milestones and the log", () => {
  const texts = ["Left Earth's gravity", "Mid-course correction", "Halfway there", "Approaching target", "Orbit insertion burn"];

  it("logs the five milestones in order when stepping day by day", () => {
    const s = flyToEnd(start(MARS_OK, "mars", 10), 0.37);
    expect(s.log.map((l) => l.text)).toEqual([...texts, ORBIT_TEXT]);
    const days = s.log.map((l) => l.day);
    expect(days).toEqual([...days].sort((a, b) => a - b));
  });

  it("logs every milestone crossed by one big step, and never twice", () => {
    const s0 = start(MARS_OK, "mars", 10);
    const s = step(step(s0, s0.totalDays * 0.6), s0.totalDays);
    expect(s.log.map((l) => l.text)).toEqual(texts);
  });
});

describe("fuel", () => {
  it("a chemical engine burns its cruise fuel at departure, then holds steady", () => {
    const s0 = start(MOON_OK, "moon");
    const s1 = step(s0, 0.5);
    expect(s1.fuelKg).toBeLessThan(s0.fuelKg);
    expect(step(s1, 1).fuelKg).toBe(s1.fuelKg);
  });

  it("an ion engine burns gradually across the cruise", () => {
    const ion: Design = { bodyId: "small", instrumentIds: ["camera"], powerId: "solarLarge", antennaId: "antSmall", engineId: "ion", rocketId: "medium", fuelKg: 200 };
    const s0 = start(ion, "moon");
    const half = step(s0, s0.totalDays / 2);
    const full = step(s0, s0.totalDays);
    expect(full.fuelKg).toBeLessThan(half.fuelKg);
    expect(half.fuelKg).toBeLessThan(s0.fuelKg);
    expect(half.fuelKg).toBeCloseTo((s0.fuelKg + full.fuelKg) / 2, 6);
    expect(step(full, 1).phase).toBe("orbit");
  });
});

describe("time scale", () => {
  it("(d) the cruise takes 60–90 real seconds for the Moon, Mars and Jupiter", () => {
    const expected: Record<number, string> = { 3: "1 sec = 1 hour", 240: "1 sec = 3 days", 1900: "1 sec = 1 month" };
    for (const days of [3, 240, 1900]) {
      const t = timeScale(days);
      expect(t.seconds).toBeGreaterThanOrEqual(60);
      expect(t.seconds).toBeLessThanOrEqual(90);
      expect(days / t.daysPerSecond).toBeCloseTo(t.seconds, 10);
      expect(t.label).toBe(expected[days]);
    }
  });

  it("stays within 60–90 seconds for every scenario, route and engine in the data", () => {
    for (const sc of scenarios) {
      for (const route of ["fast", "slow"] as const) {
        for (const engine of parts.engines) {
          const r = runChecks({ ...MOON_OK, engineId: engine.id }, sc, 3, route);
          const t = timeScale(r.tripDays);
          const label = `${sc.id} ${route} ${engine.id} (${r.tripDays} days)`;
          expect(t.seconds, label).toBeGreaterThanOrEqual(60);
          expect(t.seconds, label).toBeLessThanOrEqual(90);
        }
      }
    }
  });
});

describe("step() is pure", () => {
  it("(e) never mutates the input state", () => {
    const s0 = deepFreeze(start(MOON_OK, "moon"));
    const before = JSON.stringify(s0);
    const s1 = step(s0, 1.5);
    expect(s1).not.toBe(s0);
    expect(JSON.stringify(s0)).toBe(before);
    expect(s1.missionDay).toBe(1.5);

    const atEnd = deepFreeze(step(s0, s0.totalDays));
    const frozenBefore = JSON.stringify(atEnd);
    const settled = step(atEnd, 1);
    expect(settled.phase).toBe("orbit");
    expect(JSON.stringify(atEnd)).toBe(frozenBefore);
  });

  it("zero or negative days is a no-op", () => {
    const s = start(MOON_OK, "moon");
    expect(step(s, 0)).toBe(s);
    expect(step(s, -3)).toBe(s);
  });

  it("clamps at the end of the cruise", () => {
    const s = start(MOON_OK, "moon");
    const end = step(s, 1e9);
    expect(end.missionDay).toBe(s.totalDays);
    expect(end.phase).toBe("insertion");
  });

  it("time stands still while an event waits for a decision", () => {
    const s = { ...start(MOON_OK, "moon"), pendingEvent: { id: "test", name: "Test", kind: "problem" as const, affectsPart: null, explain: "", day: 1, protected: false, protectedText: "", failText: "", options: [] } };
    expect(step(s, 5)).toBe(s);
  });
});

describe("transferPath (for the map trail)", () => {
  it("starts at the departure point, ends at the target, and uses the launch rotation", () => {
    const s = start(MOON_OK, "mars", 10);
    const p = transferPath(s.config, 50);
    expect(p).toHaveLength(50);
    expect(p[0].radiusAU).toBeCloseTo(1, 8);
    expect(p[0].angleRad).toBeCloseTo(s.spacecraft.angleRad, 8);
    expect(p[49].radiusAU).toBeCloseTo(1.52, 8);
    const end = step(s, s.totalDays);
    expect(p[49].angleRad).toBeCloseTo(end.spacecraft.angleRad, 6);
  });
});
