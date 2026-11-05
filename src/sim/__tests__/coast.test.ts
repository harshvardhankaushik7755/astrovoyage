/**
 * The mission ends; the solar system does not.
 *
 * Once the spacecraft is in orbit the simulation has nothing left to decide, so the state stops. The
 * planets have not stopped: they go on round the Sun, and the spacecraft goes round the one it reached,
 * which is itself moving. coastAngles is the whole of that — where Earth and the target have got to a
 * given number of days after the last day of the mission.
 */
import { describe, it, expect } from "vitest";
import { coastAngles, createSimulation, step, EARTH_ORBIT_DAYS, type SimState } from "../simulation";
import { runChecks, findScenario, type Design } from "../../physics/checks";

const MOON: Design = { bodyId: "small", instrumentIds: ["camera", "magnetometer"], powerId: "solarSmall", antennaId: "antSmall", engineId: "chemical", rocketId: "medium", fuelKg: 1400 };
const MARS: Design = { bodyId: "small", instrumentIds: ["camera"], powerId: "solarSmall", antennaId: "antLarge", engineId: "chemical", rocketId: "light", fuelKg: 1800 };

/** Fly a mission with no challenges all the way to orbit. */
function arrive(design: Design, scenarioId: string): SimState {
  const sc = findScenario(scenarioId);
  const month = sc.preset.launchMonth;
  let s = createSimulation(design, sc, month, "slow", runChecks(design, sc, month, "slow"), 1, []);
  for (let i = 0; i < 2000 && s.phase !== "orbit" && s.phase !== "failed"; i++) s = step(s, s.totalDays / 50);
  expect(s.phase).toBe("orbit");
  return s;
}

/** How far apart two angles are, the short way round, so 359° and 1° are 2° apart. */
function apart(a: number, b: number): number {
  const d = Math.abs(a - b) % (2 * Math.PI);
  return Math.min(d, 2 * Math.PI - d);
}

describe("the sky carries on from exactly where the mission left it", () => {
  const mars = arrive(MARS, "mars");

  it("gives the mission's own last angles when no time has passed", () => {
    expect(coastAngles(mars, 0)).toEqual({ earthAngleRad: mars.earthAngleRad, targetAngleRad: mars.targetAngleRad });
  });

  it("never runs the clock backwards", () => {
    expect(coastAngles(mars, -50)).toEqual(coastAngles(mars, 0));
  });

  it("moves both planets on, so neither of them stops in its orbit", () => {
    const later = coastAngles(mars, 30);
    expect(apart(later.earthAngleRad, mars.earthAngleRad)).toBeGreaterThan(0.01);
    expect(apart(later.targetAngleRad, mars.targetAngleRad)).toBeGreaterThan(0.01);
  });

  it("brings each planet back to the same place after one of its own years", () => {
    expect(apart(coastAngles(mars, EARTH_ORBIT_DAYS).earthAngleRad, mars.earthAngleRad)).toBeLessThan(1e-9);
    expect(apart(coastAngles(mars, 687).targetAngleRad, mars.targetAngleRad)).toBeLessThan(1e-9);
  });

  it("moves Earth further than Mars in the same time, because the inner planet goes round faster", () => {
    const after = coastAngles(mars, 60);
    expect(apart(after.earthAngleRad, mars.earthAngleRad)).toBeGreaterThan(apart(after.targetAngleRad, mars.targetAngleRad));
  });

  it("keeps going the same way round, for as long as anyone watches", () => {
    let last = mars.targetAngleRad;
    let travelled = 0;
    for (let d = 10; d <= 680; d += 10) {
      const a = coastAngles(mars, d).targetAngleRad;
      travelled += apart(a, last);
      last = a;
    }
    expect(travelled).toBeCloseTo(2 * Math.PI * (680 / 687), 3); // 680 of the 687 days in a Mars year: just under one full lap
  });
});

describe("a Moon mission coasts too, around the Earth in the middle of the map", () => {
  const moon = arrive(MOON, "moon");

  it("leaves Earth where it is, because on this map Earth is the centre", () => {
    expect(moon.earthAngleRad).toBe(0);
    expect(coastAngles(moon, 14).earthAngleRad).toBe(0);
  });

  it("carries the Moon on round its orbit, and back to the start after one lunar month", () => {
    expect(apart(coastAngles(moon, 7).targetAngleRad, moon.targetAngleRad)).toBeGreaterThan(1);
    expect(apart(coastAngles(moon, 27.3).targetAngleRad, moon.targetAngleRad)).toBeLessThan(1e-9);
  });
});
