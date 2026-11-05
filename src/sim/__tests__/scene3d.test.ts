import { describe, it, expect } from "vitest";
import view from "../../data/view3d.json";
import scenarios from "../../data/scenarios.json";
import { runChecks, findScenario, type Design } from "../../physics/checks";
import { createSimulation, step, transferPath, EARTH_ORBIT_AU, type SimState } from "../simulation";
import { parkingOffset, scene3d, targetBodyFor, toVec } from "../scene3d";

function flying(id: string, fraction: number): SimState {
  const sc = findScenario(id);
  const { launchMonth, route, ...design } = sc.preset;
  const r = route === "fast" ? "fast" : "slow";
  let s = createSimulation(design as Design, sc, launchMonth, r, runChecks(design as Design, sc, launchMonth, r), 1, []);
  s = step(s, s.totalDays * fraction);
  return s;
}
const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

describe("scene3d: the flat map lifted into space", () => {
  it.each(scenarios.map((s) => s.id))("%s: everything lies in the orbit plane and the outer orbit is at the scene's edge", (id) => {
    const s = flying(id, 0.4);
    const g = scene3d(s, transferPath(s.config));
    for (const v of [g.earth, g.target, g.ship, ...g.path]) expect(v.y).toBe(0);
    expect(Math.max(...g.orbits.map((o) => o.radius))).toBeCloseTo(view.sceneRadius, 6);
  });

  it("places the spacecraft and the planets at the simulation's own radius and angle", () => {
    const s = flying("mars", 0.5);
    const g = scene3d(s, transferPath(s.config));
    const k = g.unitsPerAU;
    close(Math.hypot(g.ship.x, g.ship.z), s.spacecraft.radiusAU * k);
    close(Math.atan2(-g.ship.z, g.ship.x), Math.atan2(Math.sin(s.spacecraft.angleRad), Math.cos(s.spacecraft.angleRad)));
    close(Math.hypot(g.earth.x, g.earth.z), EARTH_ORBIT_AU * k);
    close(Math.hypot(g.target.x, g.target.z), s.config.targetOrbitRadiusAU * k);
  });

  it("the map's 'up' is −z, so a camera looking down sees the flat map the right way round", () => {
    const v = toVec(1, Math.PI / 2, 10);
    close(v.x, 0);
    close(v.z, -10);
  });

  it("the path starts at Earth's orbit and ends on the target's, as the Kepler transfer does", () => {
    const s = flying("mars", 0);
    const g = scene3d(s, transferPath(s.config));
    const k = g.unitsPerAU;
    close(Math.hypot(g.path[0].x, g.path[0].z), EARTH_ORBIT_AU * k);
    const end = g.path[g.path.length - 1];
    close(Math.hypot(end.x, end.z), s.config.targetOrbitRadiusAU * k);
  });

  it("the trail grows as the days pass and the heading is a unit vector", () => {
    const early = flying("mars", 0.2), late = flying("mars", 0.7);
    const a = scene3d(early, transferPath(early.config)), b = scene3d(late, transferPath(late.config));
    expect(b.flown).toBeGreaterThan(a.flown);
    for (const g of [a, b]) close(Math.hypot(g.heading.x, g.heading.z), 1);
  });

  it("a Moon trip has Earth in the middle and one orbit", () => {
    const s = flying("moon", 0.3);
    const g = scene3d(s, transferPath(s.config));
    expect(g.centre).toBe("earth");
    expect(g.centreBody).toBe("earthCentral");
    expect(g.earth).toEqual({ x: 0, y: 0, z: 0 });
    expect(g.orbits).toHaveLength(1);
  });

  it("once in orbit the spacecraft is drawn at its planet", () => {
    const s = { ...flying("mars", 0.99), phase: "orbit" as const };
    const g = scene3d(s, transferPath(s.config));
    expect(g.inOrbit).toBe(true);
    expect(g.ship).toEqual(g.target);
  });

  it("every scenario has a look, and an unknown one still gets a planet", () => {
    for (const sc of scenarios) expect(Object.keys(view.bodies)).toContain(targetBodyFor(sc.id));
    expect(targetBodyFor("pluto")).toBe("mars");
  });

  it("the parking orbit goes round the planet at a steady distance, outside it", () => {
    const radius = 0.3;
    for (const t of [0, 1.3, 2.9]) {
      const o = parkingOffset(t, radius);
      expect(Math.hypot(o.x, o.z)).toBeCloseTo(radius * view.ship.parkingOrbit, 6);
    }
  });
});
