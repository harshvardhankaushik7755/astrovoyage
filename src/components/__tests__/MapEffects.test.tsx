/**
 * The effects layer rendered to HTML: every challenge and every decision outcome shows the right
 * data-effect, the end states draw the right sprite, and the element budget holds.
 */
import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { MapEffects, decisionEffect, type Fx } from "../MapEffects";
import { mapGeometry } from "../../screens/MissionControl";
import { createSimulation, step, resolveEvent, transferPath, type ScheduledEvent, type SimState } from "../../sim/simulation";
import { runChecks, findScenario, type Design } from "../../physics/checks";

const MOON_OK: Design = { bodyId: "small", instrumentIds: ["camera", "magnetometer"], powerId: "solarSmall", antennaId: "antSmall", engineId: "chemical", rocketId: "medium", fuelKg: 1400 };
const LARGE_BUS: Design = { ...MOON_OK, bodyId: "large", fuelKg: 5000 };
const BIG_DISH: Design = { ...MOON_OK, antennaId: "antLarge" };
const RTG: Design = { ...MOON_OK, powerId: "rtg" };
const THREE: Design = { bodyId: "medium", instrumentIds: ["camera", "magnetometer", "weather"], powerId: "solarSmall", antennaId: "antSmall", engineId: "chemical", rocketId: "medium", fuelKg: 2500 };

function start(design: Design, schedule: ScheduledEvent[] = [], seed = 1): SimState {
  const sc = findScenario("moon");
  const check = runChecks(design, sc, 3, "slow");
  return createSimulation(design, sc, 3, "slow", check, seed, schedule);
}
/** A mission stopped at its first challenge. */
const pending = (eventId: string, design = MOON_OK, seed = 1) => step(start(design, [{ day: 1, eventId }], seed), 2);
/** The two seconds after a decision, as the container shows them. */
const flashOf = (s: SimState): Fx["flash"] => ({ decision: s.decisions[s.decisions.length - 1], index: s.decisions.length - 1 });

function render(sim: SimState, fx: Partial<Fx> = {}, design: Design = MOON_OK): string {
  const g = mapGeometry(sim, transferPath(sim.config, 200));
  const full: Fx = { arrival: sim.pendingEvent?.id ?? null, flash: null, countdown: null, burning: false, ...fx };
  return renderToString(<svg><MapEffects sim={sim} design={design} g={g} fx={full} /></svg>);
}
const effects = (html: string) => [...html.matchAll(/data-effect="([^"]+)"/g)].map((m) => m[1]);
const elements = (html: string) => (html.match(/<(circle|line|polygon|polyline|text|rect)\b/g) ?? []).length;

describe("arrival effects (A)", () => {
  it.each([
    ["solarStorm", "storm-arrival"],
    ["dust", "dust-arrival"],
    ["courseDrift", "drift-arrival"],
    ["lostSignal", "signal-lost"],
    ["instrumentFault", "fault-arrival"],
  ])("%s shows %s", (id, effect) => {
    const s = pending(id);
    expect(s.pendingEvent?.id).toBe(id);
    expect(effects(render(s))).toContain(effect);
  });

  it("shows nothing but the spacecraft while cruising quietly", () => {
    const s = step(start(MOON_OK), 1);
    expect(effects(render(s))).toEqual([]);
    expect(render(s)).toContain('class="ship"');
  });
});

describe("decision effects (B)", () => {
  const decided = (eventId: string, option: string, design = MOON_OK, seed = 1) => resolveEvent(pending(eventId, design, seed), option);
  /** A seed for which the storm gamble ends the way we want. */
  const seedWhere = (design: Design, failed: boolean) => {
    for (let seed = 1; seed <= 200; seed++) {
      const s = decided("solarStorm", "risky", design, seed);
      if ((s.phase === "failed") === failed) return seed;
    }
    throw new Error("no such seed");
  };

  it.each([
    ["solarStorm", "safe", MOON_OK, "storm-safe"],
    ["dust", "shake", MOON_OK, "dust-shake"],
    ["dust", "nothing", MOON_OK, "dust-settled"],
    ["courseDrift", "correct", MOON_OK, "drift-correct"],
    ["courseDrift", "ignore", MOON_OK, "drift-ignore"],
    ["lostSignal", "switch", BIG_DISH, "signal-reconnect"],
    ["lostSignal", "wait", MOON_OK, "signal-wait"],
    ["lostSignal", "guess", MOON_OK, "signal-dim"],
    ["instrumentFault", "reboot", MOON_OK, "fault-reboot"],
    ["instrumentFault", "accept", MOON_OK, "fault-accept"],
  ])("%s / %s shows %s", (eventId, option, design, effect) => {
    const s = decided(eventId, option, design);
    expect(decisionEffect(s.decisions[0], s)).toBe(effect);
    expect(effects(render(s, { flash: flashOf(s) }))).toContain(effect);
  });

  it("a storm gamble flickers when it works out, sparks and darkens the sprite when it does not", () => {
    const ok = decided("solarStorm", "risky", MOON_OK, seedWhere(MOON_OK, false));
    expect(effects(render(ok, { flash: flashOf(ok) }))).toContain("storm-flicker");
    const lost = decided("solarStorm", "risky", MOON_OK, seedWhere(MOON_OK, true));
    const html = render(lost, { flash: flashOf(lost) });
    expect(effects(html)).toContain("storm-sparks");
    expect(html).toContain("sprite dark");
    expect(render(lost)).toContain("sprite dark"); // stays dark after the flash
  });

  it("backup systems show a shield ring instead", () => {
    const s = decided("solarStorm", "risky", LARGE_BUS, seedWhere(LARGE_BUS, false));
    expect(s.decisions[0].outcome).toContain("protected");
    expect(effects(render(s, { flash: flashOf(s) }))).toContain("storm-shield");
  });

  it("challenges the design shrugs off show the auto effect", () => {
    const dust = step(start(RTG, [{ day: 1, eventId: "dust" }]), 2);
    expect(dust.pendingEvent).toBeNull();
    expect(effects(render(dust, { flash: flashOf(dust) }))).toContain("dust-auto");
    const fault = step(start(THREE, [{ day: 1, eventId: "instrumentFault" }]), 2);
    expect(effects(render(fault, { flash: flashOf(fault) }))).toContain("fault-backup");
  });

  it("puffs fly off when the panels are shaken", () => {
    const s = decided("dust", "shake");
    expect((render(s, { flash: flashOf(s) }).match(/fx-puff/g) ?? []).length).toBe(6);
  });
});

describe("lasting marks (C)", () => {
  it("an ignored drift keeps the miss path until arrival, and a guessed antenna keeps a dim link", () => {
    const drift = step(resolveEvent(pending("courseDrift"), "ignore"), 0.5);
    expect(effects(render(drift))).toContain("drift-ignored");
    const guess = step(resolveEvent(pending("lostSignal"), "guess"), 0.5);
    expect(effects(render(guess))).toContain("signal-dim");
  });

  it("marks the trail where each challenge happened", () => {
    let s = start(MOON_OK, [{ day: 1, eventId: "solarStorm" }, { day: 2, eventId: "dust" }]);
    s = resolveEvent(step(s, 3), "safe");
    s = resolveEvent(step(s, 3), "shake");
    const html = render(step(s, 0.5));
    expect(effects(html).filter((e) => e === "marker")).toHaveLength(2);
    // one marker per day, and it says so, so it can never be read as a reading off a gauge
    expect(html).toContain("🌞 Day 1");
    expect(html).toContain("🌫️ Day 2");
  });
});

describe("orbit insertion and the end", () => {
  it("counts down, burns with a flame and glow, then settles into orbit", () => {
    const s = step(start(MOON_OK), 10);
    expect(s.phase).toBe("insertion");
    const counting = render(s, { countdown: 3 });
    expect(effects(counting)).toContain("countdown");
    // the map is landscape since Stage 8: the digit belongs in the middle, not near the bottom edge
    const g = mapGeometry(s, transferPath(s.config, 200));
    const at = counting.match(/data-effect="countdown"[^>]*\sx="([\d.]+)"\s*y="([\d.]+)"/)!;
    expect(Number(at[1])).toBeCloseTo(g.viewW / 2, 1);
    expect(Number(at[2])).toBeGreaterThanOrEqual(g.viewH / 2);
    expect(Number(at[2])).toBeLessThanOrEqual(g.viewH / 2 + 24);
    const burn = render(s, { burning: true });
    expect(effects(burn)).toContain("burn");
    expect(burn).toContain('class="glow"');
    const orbit = step(s, 1);
    expect(orbit.phase).toBe("orbit");
    const html = render(orbit);
    expect(effects(html)).toContain("orbit-captured");
    expect(html).toContain("orbiting");
  });

  it("flies past the planet when the braking burn fails", () => {
    const s = step(step(start({ ...MOON_OK, fuelKg: 700 }), 10), 1);
    expect(s.phase).toBe("failed");
    expect(effects(render(s))).toContain("fly-past");
  });
});

describe("element budget", () => {
  it("stays under 60 SVG elements at the busiest moment", () => {
    let s = start(MOON_OK, [{ day: 1, eventId: "courseDrift" }, { day: 1.5, eventId: "lostSignal" }, { day: 2, eventId: "dust" }, { day: 2.5, eventId: "solarStorm" }]);
    s = resolveEvent(step(s, 3), "ignore");
    s = resolveEvent(step(s, 3), "guess");
    s = resolveEvent(step(s, 3), "nothing");
    s = step(s, 3); // the storm is waiting
    expect(s.pendingEvent?.id).toBe("solarStorm");
    const busy = render(s, { flash: flashOf(s) });
    expect(elements(busy)).toBeLessThan(60);
  });
});
