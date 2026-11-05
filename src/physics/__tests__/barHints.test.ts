import { describe, it, expect } from "vitest";
import { runChecks, findScenario, type Design } from "../checks";

const MARS_START: Design = { bodyId: "small", instrumentIds: ["camera"], powerId: "solarSmall", antennaId: "antSmall", engineId: "chemical", rocketId: "light", fuelKg: 500 };

describe("resource bars say their numbers in words", () => {
  const r = runChecks(MARS_START, findScenario("mars"), 0, "slow");

  it("each bar's hint carries the same two numbers as the bar, in plain words", () => {
    expect(r.budget.hint).toBe(`$${r.budget.value}M spent of $${r.budget.limit}M`);
    expect(r.mass.hint).toBe(`${r.mass.value} kg · rocket lifts ${r.mass.limit.toLocaleString()} kg`);
    expect(r.power.hint).toBe(`uses ${r.power.value} W · makes ${r.power.limit} W there`);
    expect(r.dv.hint).toBe(`trip needs ${r.dv.value} · fuel gives ${r.dv.limit} km/s`);
  });

  it("a starting design that cannot reach Mars says so on the fuel bar", () => {
    expect(r.dv.ok).toBe(false);
    expect(r.dv.value).toBeGreaterThan(r.dv.limit);
  });
});
