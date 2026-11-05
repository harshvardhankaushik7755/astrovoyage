/**
 * Stage 10 Part 5: the four-step strip reads the simulation and never disagrees with it.
 */
import { describe, it, expect } from "vitest";
import { missionSteps } from "../timeline";
import { createSimulation, resolveEvent, step, type SimState } from "../simulation";
import { runChecks, findScenario, type Design } from "../../physics/checks";

const MOON: Design = { bodyId: "small", instrumentIds: ["camera", "magnetometer"], powerId: "solarSmall", antennaId: "antSmall", engineId: "chemical", rocketId: "medium", fuelKg: 1400 };
const start = (design: Design = MOON, schedule: { day: number; eventId: string }[] = []) => {
  const sc = findScenario("moon");
  return createSimulation(design, sc, 3, "slow", runChecks(design, sc, 3, "slow"), 1, schedule);
};
const ids = (sim: SimState) => missionSteps(sim).map((s) => `${s.id}:${s.state}`);
const current = (sim: SimState) => missionSteps(sim).filter((s) => s.state === "current");

describe("the strip follows the mission", () => {
  it("starts on Launch, moves to Cruise, then the burn, then orbit", () => {
    const s0 = start();
    expect(ids(s0)).toEqual(["launch:current", "cruise:future", "burn:future", "orbit:future"]);

    const s1 = step(s0, 1);
    expect(s1.phase).toBe("cruise");
    expect(ids(s1)).toEqual(["launch:done", "cruise:current", "burn:future", "orbit:future"]);

    const s2 = step(s1, 100);
    expect(s2.phase).toBe("insertion");
    expect(ids(s2)).toEqual(["launch:done", "cruise:done", "burn:current", "orbit:future"]);

    const s3 = step(s2, 0);
    expect(s3.phase).toBe("orbit");
    expect(ids(s3)).toEqual(["launch:done", "cruise:done", "burn:done", "orbit:done"]);
    expect(missionSteps(s3).map((s) => s.label)).toEqual(["Launch", "Cruise", "Arrival burn", "In orbit"]);
  });

  it("a spacecraft that flies past the target marks the burn as lost", () => {
    let s = start({ ...MOON, fuelKg: 700 });
    for (let i = 0; i < 50 && s.phase !== "failed" && s.phase !== "orbit"; i++) s = step(s, 1);
    s = step(s, 0);
    expect(s.phase).toBe("failed");
    expect(ids(s)).toEqual(["launch:done", "cruise:done", "burn:failed", "orbit:future"]);
    expect(missionSteps(s).find((x) => x.state === "failed")!.label).toBe("Lost");
  });

  it("a spacecraft lost on the way marks the cruise, not a burn it never reached", () => {
    // the risky option on a solar storm, with a seed that loses the gamble
    let s: SimState | null = null;
    for (let seed = 1; seed <= 40 && !s; seed++) {
      const sc = findScenario("moon");
      const sim = step(createSimulation(MOON, sc, 3, "slow", runChecks(MOON, sc, 3, "slow"), seed, [{ day: 1, eventId: "solarStorm" }]), 2);
      const after = resolveEvent(sim, "risky");
      if (after.phase === "failed") s = after;
    }
    expect(s, "no seed in 40 lost the gamble").not.toBeNull();
    expect(s!.missionDay).toBeLessThan(s!.totalDays);
    expect(ids(s!)).toEqual(["launch:done", "cruise:failed", "burn:future", "orbit:future"]);
  });

  it("never shows two steps as the current one, whatever the mission does", () => {
    const sims: SimState[] = [];
    let s = start(MOON, [{ day: 1, eventId: "dust" }, { day: 2, eventId: "courseDrift" }]);
    for (let i = 0; i < 200 && s.phase !== "orbit" && s.phase !== "failed"; i++) {
      sims.push(s);
      s = s.pendingEvent ? resolveEvent(s, s.pendingEvent.options[0].id) : step(s, 0.25);
    }
    sims.push(s, step(s, 0));
    for (const sim of sims) {
      expect(current(sim).length, `${sim.phase} on day ${sim.missionDay}`).toBeLessThanOrEqual(1);
      expect(missionSteps(sim).filter((x) => x.state === "failed").length).toBeLessThanOrEqual(1);
      expect(missionSteps(sim)).toHaveLength(4);
    }
  });
});
