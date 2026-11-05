/**
 * Stage 9 Part 1: what a challenge is allowed to do.
 * Bonuses (science, days, fuel), the mission risk number, beginning-middle-end placement,
 * follow-up events caused by a choice, and the new design flags.
 * Every test uses a fixed seed or a fixed schedule, so it is repeatable.
 */
import { describe, it, expect, afterEach } from "vitest";
import {
  createSimulation, step, resolveEvent, riskLabel, EVENT_DEFS,
  type EventDef, type ScheduledEvent, type SimState,
} from "../simulation";
import settings from "../../data/settings.json";
import { runChecks, findScenario, type Design } from "../../physics/checks";

const MOON_OK: Design = { bodyId: "small", instrumentIds: ["camera", "magnetometer"], powerId: "solarSmall", antennaId: "antSmall", engineId: "chemical", rocketId: "medium", fuelKg: 1400 };
const MARS_ION: Design = { bodyId: "medium", instrumentIds: ["camera", "magnetometer"], powerId: "solarLarge", antennaId: "antLarge", engineId: "ion", rocketId: "medium", fuelKg: 900 };
const JUPITER_RTG: Design = { bodyId: "large", instrumentIds: ["camera", "magnetometer", "spectrometer"], powerId: "rtg", antennaId: "antLarge", engineId: "ion", rocketId: "heavy", fuelKg: 6000 };
const MONTH: Record<string, number> = { moon: 3, mars: 10, jupiter: 4 };

function start(design: Design, scenarioId: string, schedule?: ScheduledEvent[], seed = 1): SimState {
  const sc = findScenario(scenarioId);
  const month = MONTH[scenarioId];
  return createSimulation(design, sc, month, "slow", runChecks(design, sc, month, "slow"), seed, schedule);
}

/** Add a made-up event for one test, then take it away again. */
const added: string[] = [];
function addEvent(def: EventDef): EventDef {
  EVENT_DEFS.push(def);
  added.push(def.id);
  return def;
}
afterEach(() => {
  while (added.length) {
    const id = added.pop()!;
    const i = EVENT_DEFS.findIndex((e) => e.id === id);
    if (i >= 0) EVENT_DEFS.splice(i, 1);
  }
});

const option = (id: string, label: string, effect: Record<string, unknown>, safe = false) => ({ id, label, effect, safe });

describe("an option can give something back", () => {
  it("scienceBonus raises the science collected at arrival", () => {
    addEvent({
      id: "testBonus", name: "Bonus", chance: 0.1, affectsPart: null, kind: "opportunity", explain: "A chance.",
      options: [option("take", "Take it", { scienceBonus: 0.15 }), option("skip", "Stay on plan", { none: true }, true)],
    });
    const plain = start(MOON_OK, "moon", [{ day: 1, eventId: "testBonus" }]);
    const taken = resolveEvent(step(plain, 2), "take");
    const skipped = resolveEvent(step(plain, 2), "skip");
    expect(taken.scienceFactor).toBeCloseTo(1.15, 6);
    expect(taken.decisions[0].outcome).toContain("Science up 15%.");
    expect(taken.decisions[0].gain).toBe(true);

    const end = (s: SimState) => { for (let i = 0; i < 50 && s.phase !== "orbit" && s.phase !== "failed"; i++) s = step(s, 1); return s; };
    expect(end(taken).scienceCollected).toBeGreaterThan(end(skipped).scienceCollected);
  });

  it("fuelSaved gives fuel back, and a mission can never spend less than nothing", () => {
    addEvent({
      id: "testFuel", name: "Free fuel", chance: 0.1, affectsPart: null, kind: "opportunity", explain: "A free push.",
      options: [option("take", "Take the flyby", { fuelSaved: 60 })],
    });
    const s = step(start(MARS_ION, "mars", [{ day: 40, eventId: "testFuel" }]), 45);
    const saved = resolveEvent(s, "take");
    expect(saved.eventFuelKg).toBe(0); // nothing had been spent yet, so it cannot go negative
    expect(saved.fuelKg).toBeLessThanOrEqual(s.config.fuelStartKg);
    expect(saved.decisions[0].outcome).toContain("Saved 60 kg of fuel.");

    // after a costly choice the saving really is given back
    addEvent({
      id: "testCost", name: "Cost", chance: 0.1, affectsPart: null, explain: "A cost.",
      options: [option("burn", "Burn fuel", { fuelCost: 20 })],
    });
    let two = step(start(MARS_ION, "mars", [{ day: 30, eventId: "testCost" }, { day: 40, eventId: "testFuel" }]), 35);
    two = resolveEvent(two, "burn");
    expect(two.eventFuelKg).toBe(20);
    two = resolveEvent(step(two, 10), "take");
    expect(two.eventFuelKg).toBe(0);
  });

  it("clearInsertionRisk wipes the chance of missing the target", () => {
    addEvent({
      id: "testAim", name: "Aim", chance: 0.1, affectsPart: null, explain: "Aim check.", failText: "Missed.",
      options: [option("risky", "Let it drift", { riskAtInsertion: 0.2 }), option("fix", "Clean-up burn", { clearInsertionRisk: true, fuelCost: 7 })],
    });
    let s = resolveEvent(step(start(MARS_ION, "mars", [{ day: 30, eventId: "testAim" }, { day: 60, eventId: "testAim" }]), 35), "risky");
    expect(s.insertionRisk).toBeCloseTo(0.2, 6);
    expect(s.insertionRiskText).not.toBe("");
    s = resolveEvent(step(s, 40), "fix");
    expect(s.insertionRisk).toBe(0);
    expect(s.insertionRiskText).toBe("");
    expect(s.decisions[1].outcome).toContain("no chance of missing Mars");
    expect(s.riskTaken).toBeCloseTo(0.2, 6); // the gamble was still taken: the record stands
  });

  it("a gain needs a real reward and no lasting harm", () => {
    addEvent({
      id: "testMixed", name: "Mixed", chance: 0.1, affectsPart: null, explain: "A mixed bag.", failText: "Missed.",
      options: [
        option("clean", "Free science", { scienceBonus: 0.1 }),
        option("costly", "Science, but the aim suffers", { scienceBonus: 0.1, riskAtInsertion: 0.1 }),
        option("priced", "Science for fuel and days", { scienceBonus: 0.15, fuelCost: 4, daysLost: 3 }),
      ],
    });
    const s = step(start(MARS_ION, "mars", [{ day: 40, eventId: "testMixed" }]), 45);
    expect(resolveEvent(s, "clean").decisions[0].gain).toBe(true);
    expect(resolveEvent(s, "costly").decisions[0].gain).toBe(false); // a gamble is not a gain
    expect(resolveEvent(s, "priced").decisions[0].gain).toBe(true);  // fuel and days are a price, not harm
  });
});

describe("a day cost never outruns the trip", () => {
  it("the card offers the days really left, and drops the cost when there is under a day", () => {
    addEvent({
      id: "testWait", name: "Wait", chance: 0, affectsPart: null, explain: "Waiting.",
      options: [option("wait", "Wait a fortnight", { daysLost: 14 }, true)],
    });
    // a 4-day Moon trip: an event on day 1 can cost at most 3 days
    const early = step(start(MOON_OK, "moon", [{ day: 1, eventId: "testWait" }]), 2);
    expect(early.pendingEvent!.options[0].effect.daysLost).toBe(3);
    const waited = resolveEvent(early, "wait");
    expect(waited.decisions[0].effect.daysLost).toBe(3);
    expect(waited.missionDay).toBe(4);
    expect(waited.log.some((l) => l.text.includes("Lost 3 days."))).toBe(true);

    // less than a day left: the option costs no days at all, and says so
    const late = step(start(MOON_OK, "moon", [{ day: 3.5, eventId: "testWait" }]), 4);
    expect(late.pendingEvent!.options[0].effect.daysLost).toBeUndefined();
    const nothingLost = resolveEvent(late, "wait");
    expect(nothingLost.decisions[0].effect.daysLost).toBeUndefined();
    expect(nothingLost.missionDay).toBe(3.5);

    // on a long trip the whole fortnight is charged
    const mars = step(start(MARS_ION, "mars", [{ day: 40, eventId: "testWait" }]), 45);
    expect(mars.pendingEvent!.options[0].effect.daysLost).toBe(14);
  });

  it("charges exactly the days the card promised, even from an awkward fraction of a day", () => {
    addEvent({
      id: "testTen", name: "Ten", chance: 0, affectsPart: null, explain: "Waiting.",
      options: [option("wait", "Run the full check-out", { daysLost: 10 }, true)],
    });
    // 121.44 + 10 − 121.44 is 9.999999999999986 in binary floating point: the old rule charged 9
    const sc = findScenario("mars");
    const design: Design = { bodyId: "small", instrumentIds: ["camera"], powerId: "solarSmall", antennaId: "antLarge", engineId: "chemical", rocketId: "light", fuelKg: 1800 };
    const check = runChecks(design, sc, 10, "slow");
    const s = step(createSimulation(design, sc, 10, "slow", check, 1, [{ day: 121.44, eventId: "testTen" }]), 130);
    expect(s.missionDay).toBeCloseTo(121.44, 6);
    expect(s.pendingEvent!.options[0].effect.daysLost).toBe(10);
    const waited = resolveEvent(s, "wait");
    expect(waited.decisions[0].effect.daysLost).toBe(10);
    expect(waited.log.some((l) => l.text.includes("Lost 10 days."))).toBe(true);
    expect(waited.missionDay).toBeCloseTo(131.44, 6);
  });

  it("no option label promises a number of days, because the trip may be too short to keep it", () => {
    for (const e of EVENT_DEFS) {
      for (const o of e.options) {
        expect(o.label, `${e.id}/${o.id}`).not.toMatch(/\d+\s*days/i);
      }
    }
  });
});

describe("the mission risk number", () => {
  it("riskLabel turns a chance into one word", () => {
    expect(riskLabel(0)).toBe("Low");
    expect(riskLabel(0.149)).toBe("Low");
    expect(riskLabel(0.15)).toBe("Medium");
    expect(riskLabel(0.349)).toBe("Medium");
    expect(riskLabel(0.35)).toBe("High");
    expect(riskLabel(0.599)).toBe("High");
    expect(riskLabel(0.6)).toBe("Very high");
    expect(riskLabel(1)).toBe("Very high");
  });

  it("every gamble adds to it, the way chances really combine", () => {
    const s = step(start(MOON_OK, "moon", [{ day: 1, eventId: "solarStorm" }]), 2);
    expect(s.riskTaken).toBe(0);
    const risky = resolveEvent(s, "risky"); // 1 in 4 of losing the spacecraft
    expect(risky.riskTaken).toBeCloseTo(0.25, 6);
    expect(riskLabel(risky.riskTaken)).toBe("Medium");

    addEvent({
      id: "testRisk", name: "Risk", chance: 0.1, affectsPart: null, explain: "A gamble.", failText: "Missed.",
      options: [option("drift", "Let it drift", { riskAtInsertion: 0.2 })],
    });
    let two = resolveEvent(step(start(MARS_ION, "mars", [{ day: 30, eventId: "testRisk" }, { day: 60, eventId: "testRisk" }]), 35), "drift");
    two = resolveEvent(step(two, 40), "drift");
    expect(two.riskTaken).toBeCloseTo(1 - 0.8 * 0.8, 6); // 0.36, not 0.4
    expect(riskLabel(two.riskTaken)).toBe("High");
  });

  it("a safe choice never adds to it", () => {
    const s = step(start(MOON_OK, "moon", [{ day: 1, eventId: "solarStorm" }]), 2);
    expect(resolveEvent(s, "safe").riskTaken).toBe(0);
  });
});

describe("a mission has a beginning, a middle and an end", () => {
  const slices = (totalDays: number) => {
    const { from, to } = settings.eventWindow;
    const width = (to - from) / 3;
    return [0, 1, 2].map((i) => [totalDays * (from + width * i), totalDays * (from + width * (i + 1))] as const);
  };

  it("an early event lands in the first slice and a late one in the last", () => {
    addEvent({ id: "testEarly", name: "Early", chance: 50, affectsPart: null, phase: "early", explain: "Early.", options: [option("ok", "Fine", { none: true }, true)] });
    addEvent({ id: "testLate", name: "Late", chance: 50, affectsPart: null, phase: "late", explain: "Late.", options: [option("ok", "Fine", { none: true }, true)] });
    let sawEarly = 0;
    let sawLate = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const s = start(MARS_ION, "mars", undefined, seed);
      const [first, , third] = slices(s.totalDays);
      for (const u of s.upcoming) {
        if (u.eventId === "testEarly") {
          sawEarly++;
          expect(u.day).toBeGreaterThanOrEqual(first[0]);
          expect(u.day).toBeLessThanOrEqual(first[1]);
        }
        if (u.eventId === "testLate") {
          sawLate++;
          expect(u.day).toBeGreaterThanOrEqual(third[0]);
          expect(u.day).toBeLessThanOrEqual(third[1]);
        }
      }
    }
    expect(sawEarly).toBeGreaterThan(0);
    expect(sawLate).toBeGreaterThan(0);
  });

  it("the same seed still gives exactly the same mission", () => {
    for (const id of ["moon", "mars", "jupiter"]) {
      expect(start(MOON_OK, id, undefined, 7).upcoming).toEqual(start(MOON_OK, id, undefined, 7).upcoming);
    }
  });
});

describe("one choice can cause a later event", () => {
  const withFollowUp = () => {
    addEvent({
      id: "testCause", name: "Cause", chance: 0.1, affectsPart: null, explain: "Choose.", failText: "Missed.",
      options: [option("hold", "Hold course", { none: true }), option("move", "Move away", { fuelCost: 5 }, true)],
    });
    addEvent({
      id: "testEffect", name: "Damage found", chance: 0.1, affectsPart: null, follows: { eventId: "testCause", optionId: "hold" },
      explain: "A panel was hit after all.",
      options: [option("less", "Work with less power", { powerPenalty: 0.15 }, true)],
    });
  };

  it("the follow-up is never drawn on its own", () => {
    withFollowUp();
    const seen = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) start(MARS_ION, "mars", undefined, seed).upcoming.forEach((u) => seen.add(u.eventId));
    expect(seen.has("testCause")).toBe(true);
    expect(seen.has("testEffect")).toBe(false);
  });

  it("it appears only after the choice that causes it, and knows the day it came from", () => {
    withFollowUp();
    const s = step(start(MARS_ION, "mars", [{ day: 40, eventId: "testCause" }]), 45);
    expect(s.missionDay).toBe(40);

    const other = resolveEvent(s, "move");
    expect(other.upcoming).toEqual([]); // the other choice causes nothing

    const held = resolveEvent(s, "hold");
    expect(held.upcoming.map((u) => u.eventId)).toEqual(["testEffect"]);
    const when = held.upcoming[0];
    const left = held.totalDays - 40;
    expect(when.day).toBeGreaterThanOrEqual(40 + 0.2 * left);
    expect(when.day).toBeLessThanOrEqual(40 + 0.6 * left);
    expect(when.day).toBeLessThan(held.totalDays);
    expect(when.causedOnDay).toBe(40);

    // and it really fires, carrying its cause to the screen
    let later = held;
    for (let i = 0; i < 1000 && !later.pendingEvent; i++) later = step(later, 1);
    expect(later.pendingEvent?.id).toBe("testEffect");
    expect(later.pendingEvent?.causedOnDay).toBe(40);
    expect(later.pendingEvent?.kind).toBe("problem");
  });

  it("a follow-up with no room before arrival is dropped without a fuss", () => {
    withFollowUp();
    // the choice is made on arrival day itself: there is no trip left to put the follow-up in
    const s = step(start(MOON_OK, "moon", [{ day: 4, eventId: "testCause" }]), 5);
    expect(s.pendingEvent?.id).toBe("testCause");
    expect(s.missionDay).toBe(s.totalDays);
    const held = resolveEvent(s, "hold");
    expect(held.upcoming).toEqual([]);
    let end = held;
    for (let i = 0; i < 50 && end.phase !== "orbit" && end.phase !== "failed"; i++) end = step(end, 1);
    expect(["orbit", "failed"]).toContain(end.phase);
  });

  it("a follow-up caused late still lands before arrival, so it can always be reached", () => {
    withFollowUp();
    for (let seed = 1; seed <= 20; seed++) {
      const held = resolveEvent(step(start(MOON_OK, "moon", [{ day: 3.9, eventId: "testCause" }], seed), 4), "hold");
      for (const u of held.upcoming) {
        expect(u.day).toBeGreaterThan(3.9);
        expect(u.day).toBeLessThan(held.totalDays);
      }
      let end = held;
      for (let i = 0; i < 100 && end.phase !== "orbit" && end.phase !== "failed"; i++) {
        end = end.pendingEvent ? resolveEvent(end, end.pendingEvent.options[0].id) : step(end, 0.5);
      }
      expect(["orbit", "failed"]).toContain(end.phase);
    }
  });

  it("the same seed and the same choices give the same follow-up day", () => {
    withFollowUp();
    const once = resolveEvent(step(start(MARS_ION, "mars", [{ day: 40, eventId: "testCause" }], 5), 45), "hold");
    const twice = resolveEvent(step(start(MARS_ION, "mars", [{ day: 40, eventId: "testCause" }], 5), 45), "hold");
    expect(once.upcoming).toEqual(twice.upcoming);
  });
});

describe("design flags", () => {
  it("lists what each mission and design has, so events can ask for it", () => {
    const moon = start(MOON_OK, "moon").config.flags;
    expect(moon).toContain("moon");
    expect(moon).toContain("solar");
    expect(moon).not.toContain("outerPlanet");
    expect(moon).not.toContain("rtg");
    expect(moon).toContain("hasInstruments");

    const mars = start(MARS_ION, "mars").config.flags;
    expect(mars).toContain("mars");
    expect(mars).toContain("solar");
    expect(mars).not.toContain("outerPlanet"); // Mars is inside the asteroid belt, so no gravity assist
    expect(mars).toContain("dustRisk");

    const jupiter = start(JUPITER_RTG, "jupiter").config.flags;
    expect(jupiter).toContain("jupiter");
    expect(jupiter).toContain("outerPlanet");
    expect(jupiter).toContain("rtg");
    expect(jupiter).toContain("threeInstruments");
    expect(jupiter).not.toContain("solar");
    expect(jupiter).not.toContain("moon");
  });
});
