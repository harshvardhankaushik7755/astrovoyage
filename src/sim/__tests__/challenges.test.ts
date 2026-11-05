/**
 * Stage 3: surprise challenges. Every test uses a fixed seed or a fixed schedule, so it is repeatable.
 */
import { describe, it, expect } from "vitest";
import { createSimulation, step, resolveEvent, safestOption, EVENT_DEFS, FAILED_TEXT, type SimState, type ScheduledEvent } from "../simulation";
import type { Route } from "../../physics/windows";
import scenarios from "../../data/scenarios.json";
import settings from "../../data/settings.json";
import { runChecks, findScenario, type Design } from "../../physics/checks";

const MOON_OK: Design = { bodyId: "small", instrumentIds: ["camera", "magnetometer"], powerId: "solarSmall", antennaId: "antSmall", engineId: "chemical", rocketId: "medium", fuelKg: 1400 };
/** Large bus = backup systems. */
const LARGE_BUS: Design = { ...MOON_OK, bodyId: "large", fuelKg: 5000 };
/** Cheapest Mars design that passes every check. Only a few kg of fuel to spare after the braking burn. */
const MARS_TIGHT: Design = { bodyId: "small", instrumentIds: ["camera"], powerId: "solarSmall", antennaId: "antLarge", engineId: "chemical", rocketId: "light", fuelKg: 1550 };
const MARS_RTG: Design = { ...MARS_TIGHT, powerId: "rtg", rocketId: "medium", fuelKg: 3000 };
/** Solar panels with little spare power at Mars: 260 W made, 210 W needed. */
const MARS_POWER: Design = { bodyId: "small", instrumentIds: ["camera", "radar"], powerId: "solarSmall", antennaId: "antLarge", engineId: "chemical", rocketId: "medium", fuelKg: 3000 };
const THREE_INSTR: Design = { bodyId: "medium", instrumentIds: ["camera", "magnetometer", "weather"], powerId: "solarSmall", antennaId: "antSmall", engineId: "chemical", rocketId: "medium", fuelKg: 2500 };

const MONTH: Record<string, number> = { moon: 3, mars: 10, jupiter: 4 };

function start(design: Design, scenarioId: string, opts: { seed?: number; schedule?: ScheduledEvent[] } = {}): SimState {
  const sc = findScenario(scenarioId);
  const month = MONTH[scenarioId];
  return createSimulation(design, sc, month, "slow", runChecks(design, sc, month, "slow"), opts.seed ?? 1, opts.schedule);
}
const at = (day: number, eventId: string): ScheduledEvent[] => [{ day, eventId }];
const last = (s: SimState) => s.log[s.log.length - 1].text;

/** Step to the end of the mission, one day at a time. Stops early if a decision is needed. */
function fly(s: SimState): SimState {
  for (let i = 0; i < 100_000 && (s.phase === "cruise" || s.phase === "insertion") && !s.pendingEvent; i++) s = step(s, 1);
  return s;
}

describe("scheduling", () => {
  it("(6) the same seed gives the same challenges on the same days", () => {
    const a = start(MOON_OK, "mars", { seed: 42 });
    const b = start(MOON_OK, "mars", { seed: 42 });
    expect(a.upcoming).toEqual(b.upcoming);
    expect(a.upcoming.length).toBeGreaterThanOrEqual(2);
    expect(a.config.seed).toBe(42);
  });

  it("picks as many different challenges as settings allows, spread between 15% and 85% of the trip, earliest first", () => {
    const { min, max } = settings.eventsPerMission;
    for (const id of ["moon", "mars", "jupiter"]) {
      for (let seed = 1; seed <= 25; seed++) {
        const s = start(MOON_OK, id, { seed });
        const n = s.upcoming.length;
        const pool = EVENT_DEFS.filter((e) => !e.follows && (!e.onlyIf || s.config.flags.includes(e.onlyIf))).length;
        expect(n).toBeGreaterThanOrEqual(Math.min(min, pool));
        expect(n).toBeLessThanOrEqual(Math.min(max, pool));
        expect(new Set(s.upcoming.map((u) => u.eventId)).size).toBe(n);
        for (let i = 0; i < n; i++) {
          expect(s.upcoming[i].day).toBeGreaterThanOrEqual(0.15 * s.totalDays);
          expect(s.upcoming[i].day).toBeLessThanOrEqual(0.85 * s.totalDays);
          if (i > 0) expect(s.upcoming[i].day).toBeGreaterThanOrEqual(s.upcoming[i - 1].day);
        }
      }
    }
  });

  it("dust only happens where there is dust risk; instrument faults only with instruments on board", () => {
    const seen = (design: Design, scenario: string) => {
      const all = new Set<string>();
      for (let seed = 1; seed <= 40; seed++) start(design, scenario, { seed }).upcoming.forEach((u) => all.add(u.eventId));
      return all;
    };
    expect(seen(MOON_OK, "moon").has("dust")).toBe(false);
    expect(seen(MOON_OK, "jupiter").has("dust")).toBe(false);
    expect(seen(MOON_OK, "mars").has("dust")).toBe(true);
    expect(seen({ ...MOON_OK, instrumentIds: [] }, "moon").has("instrumentFault")).toBe(false);
    expect(seen(MOON_OK, "moon").has("instrumentFault")).toBe(true);
  });

  it("draws a random seed when none is given", () => {
    const sc = findScenario("moon");
    const s = createSimulation(MOON_OK, sc, 3, "slow", runChecks(MOON_OK, sc, 3, "slow"));
    expect(s.upcoming.length).toBeGreaterThanOrEqual(2);
    expect(Number.isInteger(s.config.seed)).toBe(true);
  });
});

describe("a challenge stops the clock", () => {
  it("(6) time does not advance while a decision is waiting", () => {
    const s0 = start(MOON_OK, "moon", { schedule: at(1, "solarStorm") });
    const s1 = step(s0, 2);
    expect(s1.missionDay).toBe(1);
    expect(s1.pendingEvent?.id).toBe("solarStorm");
    expect(s1.pendingEvent?.protected).toBe(false);
    expect(s1.pendingEvent?.options.map((o) => o.id)).toEqual(["safe", "risky"]);
    expect(last(s1)).toContain("Solar storm!");
    expect(step(s1, 5)).toBe(s1);
    expect(step(s1, 1e9)).toBe(s1);
  });

  it("resolving applies the option, logs it, records the decision, and lets time move again", () => {
    const s1 = step(start(MOON_OK, "moon", { schedule: at(1, "solarStorm") }), 2);
    const s2 = resolveEvent(s1, "safe");
    expect(s2.pendingEvent).toBeNull();
    expect(s2.scienceFactor).toBeCloseTo(0.9, 10);
    expect(s2.decisions).toEqual([{ day: 1, event: "Solar storm", option: "Switch the instruments off until it passes", outcome: "Science down 10%.", eventId: "solarStorm", optionId: "safe", hurt: true, gain: false, effect: { sciencePenalty: 0.1 } }]);
    expect(last(s2)).toBe("You chose: Switch the instruments off until it passes. Science down 10%.");
    const s3 = step(s2, 1);
    expect(s3.missionDay).toBe(2);
    const end = fly(s3);
    expect(end.phase).toBe("orbit");
    expect(end.scienceCollected).toBe(16); // 18 points × 0.9
    expect(end.log.some((l) => l.text === "Science collected: 16 of 18 points.")).toBe(true);
  });

  it("unknown options, and calls without a waiting challenge, change nothing", () => {
    const s0 = start(MOON_OK, "moon", { schedule: [] });
    expect(resolveEvent(s0, "safe")).toBe(s0);
    const s1 = step(start(MOON_OK, "moon", { schedule: at(1, "solarStorm") }), 2);
    expect(resolveEvent(s1, "nope")).toBe(s1);
  });

  it("two challenges on the same day come one after the other", () => {
    const s1 = step(start(MOON_OK, "moon", { schedule: [{ day: 1, eventId: "solarStorm" }, { day: 1, eventId: "lostSignal" }] }), 3);
    expect(s1.pendingEvent?.id).toBe("solarStorm");
    const s2 = step(resolveEvent(s1, "safe"), 1);
    expect(s2.missionDay).toBe(1);
    expect(s2.pendingEvent?.id).toBe("lostSignal");
  });
});

describe("risk", () => {
  it("(6) keeping the instruments on in a storm can lose the spacecraft", () => {
    const outcomes = new Set<string>();
    let lostText = "";
    for (let seed = 1; seed <= 60; seed++) {
      const s = resolveEvent(step(start(MOON_OK, "moon", { seed, schedule: at(1, "solarStorm") }), 2), "risky");
      outcomes.add(s.phase);
      if (s.phase === "failed") {
        lostText = last(s);
        expect(step(s, 5)).toBe(s);
      }
    }
    expect(outcomes).toEqual(new Set(["cruise", "failed"]));
    expect(lostText).toContain("The storm burned out the electronics.");
  });

  it("ignoring course drift can mean missing the target on arrival", () => {
    const outcomes = new Set<string>();
    let text = "";
    for (let seed = 1; seed <= 60; seed++) {
      const s1 = resolveEvent(step(start(MOON_OK, "moon", { seed, schedule: at(1, "courseDrift") }), 2), "ignore");
      expect(s1.insertionRisk).toBeCloseTo(0.3, 10);
      expect(s1.phase).toBe("cruise");
      const end = fly(s1);
      outcomes.add(end.phase);
      if (end.phase === "failed") text = last(end);
    }
    expect(outcomes).toEqual(new Set(["orbit", "failed"]));
    expect(text).toBe("The spacecraft was off course and flew past the Moon.");
  });
});

describe("protection", () => {
  it("(6) a large bus with backup systems removes the storm penalty", () => {
    const s1 = step(start(LARGE_BUS, "moon", { schedule: at(1, "solarStorm") }), 2);
    const ev = s1.pendingEvent!;
    expect(ev.protected).toBe(true);
    expect(ev.options.find((o) => o.id === "safe")!.effect.sciencePenalty).toBeUndefined();
    expect(ev.options.find((o) => o.id === "risky")!.effect.riskOfFailure).toBe(0.05);
    const s2 = resolveEvent(s1, "safe");
    expect(s2.scienceFactor).toBe(1);
    expect(last(s2)).toContain("Your backup systems protected you.");
    expect(s2.decisions[0].outcome).toBe("Your backup systems protected you.");
  });

  it("an RTG makes dust harmless, with no decision needed", () => {
    const s1 = step(start(MARS_RTG, "mars", { schedule: at(10, "dust") }), 20);
    expect(s1.missionDay).toBe(20);
    expect(s1.pendingEvent).toBeNull();
    expect(s1.powerFactor).toBe(1);
    expect(s1.decisions).toEqual([{ day: 10, event: "Dust on the solar panels", option: "No decision needed", outcome: "Your nuclear battery does not need sunlight. No power was lost.", eventId: "dust", optionId: "auto", hurt: false, gain: false, effect: {} }]);
  });

  it("with solar panels, dust needs a decision, and doing nothing costs power", () => {
    const s1 = step(start(MARS_TIGHT, "mars", { schedule: at(10, "dust") }), 20);
    expect(s1.missionDay).toBe(10);
    expect(s1.pendingEvent?.id).toBe("dust");
    const s2 = resolveEvent(s1, "nothing");
    expect(s2.powerFactor).toBeCloseTo(0.7, 10);
    expect(s2.powerW).toBeCloseTo(s1.powerW * 0.7, 6);
  });

  it("three instruments: a backup instrument takes over; one instrument: you must decide", () => {
    const three = step(start(THREE_INSTR, "moon", { schedule: at(1, "instrumentFault") }), 2);
    expect(three.pendingEvent).toBeNull();
    expect(three.missionDay).toBe(2);
    expect(three.log.some((l) => l.text === "Backup instrument took over.")).toBe(true);
    const one = step(start(MOON_OK, "moon", { schedule: at(1, "instrumentFault") }), 2);
    expect(one.pendingEvent?.options.map((o) => o.id)).toEqual(["reboot", "accept"]);
  });

  it("the large dish antenna adds a way out of a lost signal", () => {
    const small = step(start(MOON_OK, "moon", { schedule: at(1, "lostSignal") }), 2);
    expect(small.pendingEvent?.options.map((o) => o.id)).toEqual(["wait", "guess"]);
    const guessed = resolveEvent(small, "guess");
    expect(guessed.signalFactor).toBeCloseTo(0.8, 10);
    expect(guessed.signalStrength).toBeCloseTo(small.signalStrength * 0.8, 10);

    const large = step(start({ ...MOON_OK, antennaId: "antLarge" }, "moon", { schedule: at(1, "lostSignal") }), 2);
    expect(large.pendingEvent?.options.map((o) => o.id)).toEqual(["switch", "wait", "guess"]);
    const switched = resolveEvent(large, "switch");
    expect(switched.scienceFactor).toBe(1);
    expect(switched.decisions[0].outcome).toBe("Your large dish antenna found Earth again.");
  });
});

describe("fuel costs and the safest option", () => {
  it("a fuel cost the tank cannot afford is flagged, and mission control avoids it", () => {
    const tight = step(start(MARS_TIGHT, "mars", { schedule: at(50, "courseDrift") }), 60);
    const ev = tight.pendingEvent!;
    expect(ev.options.find((o) => o.id === "correct")!.warning).toContain("not be enough fuel");
    expect(safestOption(ev).id).toBe("ignore");
    const end = fly(resolveEvent(tight, "correct"));
    expect(end.phase).toBe("failed");
    expect(last(end)).toBe(FAILED_TEXT);

    const roomy = step(start(MOON_OK, "moon", { schedule: at(1, "courseDrift") }), 2);
    expect(roomy.pendingEvent!.options.find((o) => o.id === "correct")!.warning).toBeUndefined();
    expect(safestOption(roomy.pendingEvent!).id).toBe("correct");
    const end2 = fly(resolveEvent(roomy, "correct"));
    expect(end2.phase).toBe("orbit");
    expect(end2.eventFuelKg).toBe(8);
  });

  it("the safest option never gambles when there is an alternative", () => {
    const storm = step(start(MOON_OK, "moon", { schedule: at(1, "solarStorm") }), 2);
    expect(safestOption(storm.pendingEvent!).id).toBe("safe");
    const signal = step(start(MOON_OK, "moon", { schedule: at(1, "lostSignal") }), 2);
    expect(safestOption(signal.pendingEvent!).id).toBe("wait");
  });

  it("a decision made by mission control is logged as such", () => {
    const s1 = step(start(MOON_OK, "moon", { schedule: at(1, "solarStorm") }), 2);
    const s2 = resolveEvent(s1, safestOption(s1.pendingEvent!).id, true);
    expect(last(s2)).toContain("Mission control chose for you");
  });

  it("penalties add up in the science collected, and a power shortfall shows in the log", () => {
    let s = step(start(MARS_POWER, "mars", { schedule: [{ day: 30, eventId: "solarStorm" }, { day: 60, eventId: "dust" }] }), 40);
    expect(s.pendingEvent?.id).toBe("solarStorm");
    s = resolveEvent(s, "safe");
    s = step(s, 40);
    expect(s.pendingEvent?.id).toBe("dust");
    s = resolveEvent(s, "nothing");
    const end = fly(s);
    expect(end.phase).toBe("orbit");
    expect(end.powerW).toBeLessThan(end.powerNeededW);
    expect(end.scienceCollected).toBeLessThan(end.config.scienceTotal * 0.9);
    expect(end.log.some((l) => l.text.includes("not enough power to run every instrument"))).toBe(true);
  });
});

describe("the mission never gets stuck", () => {
  it("a challenge whose options are all unavailable resolves itself", () => {
    EVENT_DEFS.push({ id: "_impossible", name: "Impossible", chance: 1, affectsPart: null, explain: "Test.", options: [{ id: "x", label: "x", effect: {}, onlyIf: "no-such-flag" }] });
    try {
      const s = step(start(MOON_OK, "moon", { schedule: at(1, "_impossible") }), 2);
      expect(s.pendingEvent).toBeNull();
      expect(s.missionDay).toBe(2);
      expect(s.decisions[0].outcome).toBe("Nothing could be done about it.");
    } finally {
      EVENT_DEFS.pop();
    }
  });

  it("every preset, 30 seeds each, with mission control deciding: always ends in orbit or a failure", () => {
    for (const sc of scenarios) {
      const { launchMonth, route, ...design } = sc.preset;
      const r: Route = route === "fast" ? "fast" : "slow";
      const check = runChecks(design, sc, launchMonth, r);
      for (let seed = 1; seed <= 30; seed++) {
        let s = createSimulation(design, sc, launchMonth, r, check, seed);
        for (let i = 0; i < 10_000 && s.phase !== "orbit" && s.phase !== "failed"; i++) {
          s = s.pendingEvent ? resolveEvent(s, safestOption(s.pendingEvent).id, true) : step(s, s.totalDays / 100);
        }
        const label = `${sc.id} seed ${seed}`;
        expect(["orbit", "failed"], label).toContain(s.phase);
        expect(s.upcoming, label).toEqual([]);
        expect(s.decisions.length, label).toBeGreaterThanOrEqual(2);
      }
    }
  });
});

describe("lost days (waiting costs mission time)", () => {
  it("waiting a week moves the clock forward, logs it, and records the effect", () => {
    const s1 = step(start(MOON_OK, "mars", { schedule: at(30, "lostSignal") }), 40);
    expect(s1.pendingEvent?.id).toBe("lostSignal");
    expect(s1.missionDay).toBe(30);
    const s2 = resolveEvent(s1, "wait");
    expect(s2.missionDay).toBe(37);
    expect(s2.decisions[0].effect).toEqual({ sciencePenalty: 0.1, daysLost: 7 });
    expect(last(s2)).toContain("Lost 7 days.");
    expect(s2.fuelKg).toBeCloseTo(s1.fuelKg, 6);
    expect(step(s2, 1).missionDay).toBe(38);
  });

  it("logs a milestone crossed during the lost days, once", () => {
    const s1 = step(start(MOON_OK, "mars", { schedule: at(80, "lostSignal") }), 90);
    const s2 = resolveEvent(s1, "wait");
    expect(s2.log.filter((l) => l.text === "Mid-course correction")).toHaveLength(1);
    expect(step(s2, 1).log.filter((l) => l.text === "Mid-course correction")).toHaveLength(1);
  });

  it("cannot jump past the end of the cruise", () => {
    const s1 = step(start(MOON_OK, "moon", { schedule: at(3, "lostSignal") }), 4);
    const s2 = resolveEvent(s1, "wait");
    expect(s2.missionDay).toBe(4);
    expect(step(s2, 1).phase).toBe("insertion");
  });
});

describe("a delay never outruns the trip (Stage 8 review)", () => {
  it("the card offers the days the trip can really lose, in whole days", () => {
    // Moon, slow route: 4 days. A challenge on day 1 leaves 3 days, so "wait a week" can only cost 3.
    const sc = findScenario("moon");
    const check = runChecks(MOON_OK, sc, 3, "slow");
    const s = step(createSimulation(MOON_OK, sc, 3, "slow", check, 1, [{ day: 1, eventId: "lostSignal" }]), 2);
    const wait = s.pendingEvent!.options.find((o) => o.id === "wait")!;
    expect(s.totalDays).toBe(4);
    expect(wait.effect.daysLost).toBe(3);

    const after = resolveEvent(s, "wait");
    expect(after.decisions[0].effect.daysLost).toBe(3); // the card, the clock and the results agree
    expect(after.missionDay).toBe(4);
    expect(after.log.some((l) => l.text.includes("Lost 3 days."))).toBe(true);
    expect(after.log.some((l) => /\d+\.\d+ days/.test(l.text))).toBe(false); // never a fraction of a day
  });

  it("on a long trip the full week is still offered and taken", () => {
    const sc = findScenario("mars");
    const design: Design = { ...MOON_OK, antennaId: "antSmall", fuelKg: 2600 };
    const check = runChecks(design, sc, 10, "slow");
    const s = step(createSimulation(design, sc, 10, "slow", check, 1, [{ day: 30, eventId: "lostSignal" }]), 31);
    expect(s.pendingEvent!.options.find((o) => o.id === "wait")!.effect.daysLost).toBe(7);
  });

  it("the braking burn waits for a challenge that is still on the card", () => {
    // the lost week pushes the clock to the last day while another challenge is still waiting
    const sc = findScenario("moon");
    const check = runChecks(MOON_OK, sc, 3, "slow");
    let s = createSimulation(MOON_OK, sc, 3, "slow", check, 1, [{ day: 1, eventId: "lostSignal" }, { day: 1.5, eventId: "courseDrift" }]);
    s = step(s, 2);
    s = resolveEvent(s, "wait");
    expect(s.missionDay).toBe(4);
    s = step(s, 0.1);
    expect(s.pendingEvent?.id).toBe("courseDrift");
    expect(s.phase).toBe("cruise"); // not "insertion": nothing may happen until the player answers
    s = resolveEvent(s, "correct");
    s = step(s, 0.1);
    expect(s.phase).toBe("insertion");
  });
});
