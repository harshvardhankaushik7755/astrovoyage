import { describe, it, expect } from "vitest";
import { deltaV, fuelNeeded, fuelBurned } from "../rocketEquation";
import { solarPowerAt } from "../power";
import { checkWindow, routeDescription } from "../windows";
import { dataReturnedFraction } from "../comms";
import { runChecks, findScenario } from "../checks";

describe("rocket equation (GDD Section 6 worked example)", () => {
  it("600 kg empty + chemical engine (Isp 320) needs about 3,100 kg fuel for Mars (5.7 km/s)", () => {
    const fuel = fuelNeeded(320, 600, 5.7);
    expect(fuel).toBeGreaterThan(3000);
    expect(fuel).toBeLessThan(3200);
  });
  it("same spacecraft with an ion engine (Isp 3000) needs only about 130 kg fuel", () => {
    const fuel = fuelNeeded(3000, 600, 5.7);
    expect(fuel).toBeGreaterThan(110);
    expect(fuel).toBeLessThan(140);
  });
  it("deltaV and fuelNeeded agree with each other", () => {
    const fuel = fuelNeeded(320, 600, 4.0);
    expect(deltaV(320, 600 + fuel, 600)).toBeCloseTo(4.0, 5);
  });
  it("no fuel means no Δv", () => {
    expect(deltaV(320, 600, 600)).toBe(0);
  });
});

describe("solar power (inverse-square rule)", () => {
  it("Mars gets about 43% of Earth sunlight", () => {
    expect(solarPowerAt(100, 1.52) / 100).toBeCloseTo(0.43, 1);
  });
  it("Jupiter gets about 3.7%", () => {
    expect(solarPowerAt(100, 5.2) / 100).toBeCloseTo(0.037, 2);
  });
});

describe("launch windows", () => {
  it("Moon: any month is fine", () => {
    expect(checkWindow(7, 0, 0).status).toBe("any");
  });
  it("Mars: window opens every 26 months at the offset", () => {
    expect(checkWindow(10, 26, 10).status).toBe("open");
    expect(checkWindow(36, 26, 10).status).toBe("open");
    expect(checkWindow(12, 26, 10).status).toBe("near");
    expect(checkWindow(20, 26, 10).status).toBe("closed");
  });
});

describe("comms", () => {
  it("large antenna at the Moon returns everything", () => {
    expect(dataReturnedFraction(40, 1, 12)).toBe(1);
  });
  it("small antenna at Jupiter returns almost nothing", () => {
    expect(dataReturnedFraction(4, 0.01, 12)).toBeLessThan(0.01);
  });
});

describe("full checks", () => {
  const moon = findScenario("moon");
  it("a sensible Moon design passes all checks", () => {
    const r = runChecks(
      { bodyId: "small", instrumentIds: ["camera", "magnetometer"], powerId: "solarSmall", antennaId: "antSmall", engineId: "chemical", rocketId: "medium", fuelKg: 1400 },
      moon, 3, "slow",
    );
    expect(r.problems).toEqual([]);
    expect(r.allOk).toBe(true);
  });
  it("small solar panels fail at Jupiter", () => {
    const r = runChecks(
      { bodyId: "medium", instrumentIds: ["camera", "magnetometer"], powerId: "solarSmall", antennaId: "antLarge", engineId: "ion", rocketId: "heavy", fuelKg: 300 },
      findScenario("jupiter"), 4, "slow",
    );
    expect(r.power.ok).toBe(false);
  });
});

describe("fuelBurned (fuel used when extra fuel is dead weight)", () => {
  it("matches fuelNeeded when the tank holds exactly the fuel needed", () => {
    const need = fuelNeeded(320, 600, 4.0);
    expect(fuelBurned(320, 600 + need, 4.0)).toBeCloseTo(need, 6);
  });
  it("burns more when the spacecraft carries extra fuel", () => {
    const need = fuelNeeded(320, 600, 4.0);
    expect(fuelBurned(320, 600 + need + 1000, 4.0)).toBeGreaterThan(need);
  });
  it("burns nothing for zero speed change", () => {
    expect(fuelBurned(320, 2000, 0)).toBe(0);
  });
  it("runChecks reports the dry mass", () => {
    const r = runChecks(
      { bodyId: "small", instrumentIds: ["camera", "magnetometer"], powerId: "solarSmall", antennaId: "antSmall", engineId: "chemical", rocketId: "medium", fuelKg: 1400 },
      findScenario("moon"), 3, "slow",
    );
    expect(r.dryMassKg).toBe(350);
    expect(r.mass.value).toBe(1750);
    expect(r.dvNeededKmS).toBeCloseTo(3.6, 10);
    expect(r.dvAvailableKmS).toBeGreaterThan(r.dvNeededKmS);
  });
});

describe("routeDescription", () => {
  it("turns the multipliers into words", () => {
    expect(routeDescription("fast")).toBe("15% more fuel, 25% shorter trip");
    expect(routeDescription("slow")).toBe("10% less fuel, 40% longer trip");
  });
});
