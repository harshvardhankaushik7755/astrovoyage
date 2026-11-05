import { describe, expect, it } from "vitest";
import parts from "../../data/parts.json";
import scenarios from "../../data/scenarios.json";
import { captureDeltaV, formatPeriod, orbitPeriodHours } from "../orbits";
import {
  defaultPlan, findObjective, findOrbit, fitLevel, insertionDeltaV, instrumentTag, instrumentWeight, orbitFit, planScience, plansFor,
} from "../plan";
import { runChecks, type Design } from "../checks";
import { fuelNeeded } from "../rocketEquation";

const MARS = { muKm3s2: 42828, radiusKm: 3389.5, arrivalSpeedKmS: 3.05 };

describe("capture burn (real two-body physics)", () => {
  it("into a circle it is the hyperbola speed minus the circular speed", () => {
    const r = MARS.radiusKm + 400;
    const expected = Math.sqrt(MARS.arrivalSpeedKmS ** 2 + (2 * MARS.muKm3s2) / r) - Math.sqrt(MARS.muKm3s2 / r);
    expect(captureDeltaV(MARS, { periapsisKm: 400, apoapsisKm: 400 })).toBeCloseTo(expected, 10);
  });

  it("a long oval needs much less braking than a low circle (why Mangalyaan used one)", () => {
    const oval = captureDeltaV(MARS, { periapsisKm: 420, apoapsisKm: 77000 });
    const circle = captureDeltaV(MARS, { periapsisKm: 400, apoapsisKm: 400 });
    expect(oval).toBeLessThan(circle / 2);
  });

  it("matches real missions: Juno ≈ 0.54 km/s, an LRO-style lunar orbit ≈ 0.8 km/s", () => {
    expect(insertionDeltaV("jupiter", "close")).toBeCloseTo(0.54, 1);
    expect(insertionDeltaV("moon", "low")).toBeCloseTo(0.8, 1);
  });

  it("each scenario's insertionDeltaV agrees with the real burn into its usual orbit", () => {
    for (const sc of scenarios) {
      expect(Math.abs(insertionDeltaV(sc.id, plansFor(sc.id).defaultOrbit) - sc.insertionDeltaV)).toBeLessThan(0.03);
    }
  });

  it("orbit period follows Kepler's third law: about 2 hours at the Moon, about 53 days for Juno", () => {
    const moon = plansFor("moon");
    expect(orbitPeriodHours(moon.body, findOrbit("moon", "low"))).toBeCloseTo(1.96, 1);
    const juno = orbitPeriodHours(plansFor("jupiter").body, findOrbit("jupiter", "close")) / 24;
    expect(juno).toBeGreaterThan(50);
    expect(juno).toBeLessThan(56);
    expect(formatPeriod(2)).toBe("2 hours");
    expect(formatPeriod(53.5 * 24)).toBe("54 days");
  });
});

describe("plans.json is complete", () => {
  it("every objective rates every orbit and names instruments that exist", () => {
    const ids = new Set(parts.instruments.map((p) => p.id));
    for (const sc of scenarios) {
      const p = plansFor(sc.id);
      expect(p.orbits.some((o) => o.id === p.defaultOrbit)).toBe(true);
      expect(p.objectives.length).toBeGreaterThanOrEqual(2);
      for (const o of p.objectives) {
        for (const orbit of p.orbits) expect(o.orbitFit[orbit.id]).toBeGreaterThan(0);
        for (const k of o.key) expect(ids.has(k)).toBe(true);
        for (const k of Object.keys(o.instruments)) expect(ids.has(k)).toBe(true);
      }
    }
  });
});

describe("the plan changes the checks", () => {
  const design: Design = { bodyId: "medium", instrumentIds: ["camera", "spectrometer"], powerId: "solarLarge", antennaId: "antLarge",
    engineId: "chemical", rocketId: "heavy", fuelKg: 6000 };

  it("the default plan keeps the old numbers: plain science sum and the scenario's own Δv", () => {
    for (const sc of scenarios) {
      const plan = defaultPlan(sc.id);
      const instruments = design.instrumentIds.map((id) => parts.instruments.find((p) => p.id === id)!);
      expect(planScience(sc.id, plan, instruments)).toBe(instruments.reduce((s, i) => s + i.science, 0));
      const r = runChecks(design, sc, sc.preset.launchMonth, "slow", plan);
      expect(r.insertionDvKmS).toBe(sc.insertionDeltaV);
    }
  });

  it("a harder orbit adds exactly the extra braking to the Δv the trip needs", () => {
    const mars = scenarios.find((s) => s.id === "mars")!;
    const oval = runChecks(design, mars, mars.preset.launchMonth, "slow", { objectiveId: "photos", orbitId: "oval" });
    const low = runChecks(design, mars, mars.preset.launchMonth, "slow", { objectiveId: "photos", orbitId: "low" });
    const extra = insertionDeltaV("mars", "low") - insertionDeltaV("mars", "oval");
    expect(low.dvNeededKmS - oval.dvNeededKmS).toBeCloseTo(extra, 10);
    expect(low.insertionDvKmS - oval.insertionDvKmS).toBeCloseTo(extra, 10);
  });

  it("the goal rewards its own instruments and the orbit's fit scales the science", () => {
    const moon = scenarios.find((s) => s.id === "moon")!;
    const map = runChecks(design, moon, 0, "slow", { objectiveId: "map", orbitId: "low" });
    const ice = runChecks(design, moon, 0, "slow", { objectiveId: "ice", orbitId: "low" });
    const iceOval = runChecks(design, moon, 0, "slow", { objectiveId: "ice", orbitId: "oval" });
    expect(ice.science).toBeGreaterThan(map.science);
    expect(iceOval.science).toBeLessThan(ice.science);
    const iceGoal = findObjective("moon", "ice");
    expect(instrumentWeight(iceGoal, "spectrometer")).toBeGreaterThan(1);
    expect(instrumentTag(iceGoal, "spectrometer")?.tone).toBe("good");
    expect(instrumentTag(iceGoal, "weather")?.tone).toBe("bad");
    expect(fitLevel(orbitFit(iceGoal, "low"))).toBe("great");
    expect(fitLevel(orbitFit(iceGoal, "oval"))).toBe("poor");
  });
});

/** All instrument sets a bus can carry (1 up to its slots). */
function subsets(ids: string[], max: number): string[][] {
  const out: string[][] = [];
  const walk = (start: number, cur: string[]) => {
    if (cur.length) out.push([...cur]);
    if (cur.length === max) return;
    for (let i = start; i < ids.length; i++) walk(i + 1, [...cur, ids[i]]);
  };
  walk(0, []);
  return out;
}

describe("every goal can be won from its best orbit", () => {
  for (const sc of scenarios) {
    for (const objective of plansFor(sc.id).objectives) {
      it(`${sc.id} · ${objective.id}`, () => {
        const best = plansFor(sc.id).orbits.reduce((a, b) => (orbitFit(objective, b.id) > orbitFit(objective, a.id) ? b : a));
        const plan = { objectiveId: objective.id, orbitId: best.id };
        let found = false;
        search: for (const body of parts.bodies)
          for (const instrumentIds of subsets(parts.instruments.map((p) => p.id), body.slots))
            for (const power of parts.powerSources) for (const antenna of parts.antennas)
              for (const engine of parts.engines) for (const rocket of parts.rockets) {
                const base: Design = { bodyId: body.id, instrumentIds, powerId: power.id, antennaId: antenna.id,
                  engineId: engine.id, rocketId: rocket.id, fuelKg: 0 };
                const dry = runChecks(base, sc, sc.preset.launchMonth, "slow", plan);
                const fuelKg = Math.ceil(fuelNeeded(engine.isp, dry.dryMassKg, dry.dvNeededKmS) * 1.02);
                const r = runChecks({ ...base, fuelKg }, sc, sc.preset.launchMonth, "slow", plan);
                // a win: every check passes and the goal's own instruments are on board
                if (r.allOk && objective.key.some((k) => instrumentIds.includes(k))) { found = true; break search; }
              }
        expect(found).toBe(true);
      });
    }
  }
});
