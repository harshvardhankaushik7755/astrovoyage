import { describe, it, expect } from "vitest";
import { scoreMission, decisionVerdict } from "../score";
import { createSimulation, step, resolveEvent, type ScheduledEvent, type SimState } from "../simulation";
import { runChecks, findScenario, type Design } from "../../physics/checks";

const MOON_OK: Design = { bodyId: "small", instrumentIds: ["camera", "magnetometer"], powerId: "solarSmall", antennaId: "antSmall", engineId: "chemical", rocketId: "medium", fuelKg: 1400 };

/** Fly a design to the end, answering every challenge with the given option id. */
function flown(design: Design, schedule: ScheduledEvent[] = [], choose = "safe"): { sim: SimState; check: ReturnType<typeof runChecks> } {
  const sc = findScenario("moon");
  const check = runChecks(design, sc, 3, "slow");
  let s = createSimulation(design, sc, 3, "slow", check, 1, schedule);
  for (let i = 0; i < 10_000 && s.phase !== "orbit" && s.phase !== "failed"; i++) {
    s = s.pendingEvent ? resolveEvent(s, choose) : step(s, 1);
  }
  return { sim: s, check };
}

describe("scoreMission", () => {
  it("a clean Moon flight: science plus money left, three stars", () => {
    const { sim, check } = flown(MOON_OK);
    const s = scoreMission(sim, check);
    expect(s.flown).toBe(true);
    expect(s.reached).toBe(true);
    expect(s.science).toBe(18);
    expect(s.successFraction).toBe(1);
    expect(s.moneyLeft).toBe(103);
    expect(s.score).toBe(121);
    expect(s.stars).toEqual({ reached: true, fullSuccess: true, underBudget: true });
    expect(s.starCount).toBe(3);
  });

  it("a storm that cost 10% of the science drops the full-success star", () => {
    const { sim, check } = flown(MOON_OK, [{ day: 1, eventId: "solarStorm" }], "safe");
    const s = scoreMission(sim, check);
    expect(s.science).toBe(16);
    expect(s.stars.fullSuccess).toBe(false);
    expect(s.starCount).toBe(2);
    expect(s.score).toBe(119);
  });

  it("a failed flight scores the money left only, with just the budget star", () => {
    const { sim, check } = flown({ ...MOON_OK, fuelKg: 700 });
    expect(sim.phase).toBe("failed");
    const s = scoreMission(sim, check);
    expect(s.successFraction).toBe(0);
    expect(s.science).toBe(0);
    expect(s.score).toBe(s.moneyLeft);
    expect(s.stars).toEqual({ reached: false, fullSuccess: false, underBudget: true });
  });

  it("without a flight, a passing design counts as reached and an over-budget one does not", () => {
    const sc = findScenario("moon");
    const ok = scoreMission(null, runChecks(MOON_OK, sc, 3, "slow"));
    expect(ok.flown).toBe(false);
    expect(ok.reached).toBe(true);
    expect(ok.science).toBe(18);
    const over = scoreMission(null, runChecks({ ...MOON_OK, powerId: "rtg", rocketId: "heavy" }, sc, 3, "slow"));
    expect(over.reached).toBe(false);
    expect(over.moneyLeft).toBe(0);
    expect(over.score).toBe(0);
    expect(over.stars).toEqual({ reached: false, fullSuccess: false, underBudget: false });
  });
});

describe("decisionVerdict", () => {
  it("flags the decisions that cost something", () => {
    const base = { day: 1, event: "Solar storm", eventId: "solarStorm", option: "x", optionId: "x", outcome: "", gain: false, effect: {} };
    expect(decisionVerdict({ ...base, hurt: true })).toBe("warn");
    expect(decisionVerdict({ ...base, hurt: false })).toBe("ok");
  });
});
