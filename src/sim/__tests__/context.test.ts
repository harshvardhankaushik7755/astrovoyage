/**
 * Stage 8 data test: every challenge carries real-world context, and the chips under every option are
 * generated from the engine's own effect objects, so they can never say something it does not do.
 */
import { describe, it, expect } from "vitest";
import events from "../../data/events.json";
import { EVENT_DEFS, createSimulation } from "../simulation";
import scenarios from "../../data/scenarios.json";
import { runChecks, type Design } from "../../physics/checks";

import { affectsLabels, affectTone, eventContext, protectionNote, fillTarget } from "../context";

/** One design of each shape, so the flag list below covers everything a player can build. */
const DESIGNS: Design[] = [
  { bodyId: "small", instrumentIds: ["camera"], powerId: "solarSmall", antennaId: "antSmall", engineId: "chemical", rocketId: "light", fuelKg: 500 },
  { bodyId: "large", instrumentIds: ["camera", "magnetometer", "spectrometer"], powerId: "rtg", antennaId: "antLarge", engineId: "ion", rocketId: "heavy", fuelKg: 5000 },
];


/**
 * Most real stories are one thing that happened on a date, so they name the year. These four
 * describe how spaceflight works rather than a single event, so there is no year to give.
 * Any other story without a year is one nobody has pinned down, and this test says so.
 */
const STANDING_FACTS = ["radiationBelt", "debrisDamage", "assistCheck", "extraData"];

describe("every challenge carries context", () => {
  it.each(events.map((e) => [e.id, e] as const))("%s has whatIsIt, a real story and howCommon", (id, e) => {
    expect(e.whatIsIt.length).toBeGreaterThan(30);
    expect(e.realExample.length).toBeGreaterThan(30);
    if (!STANDING_FACTS.includes(id)) expect(e.realExample, `${id} should name a year`).toMatch(/\b(19|20)\d\d\b/);
    expect(e.howCommon.length).toBeGreaterThan(5);
  });

  it("every option can be put into words, so no card is ever left blank", () => {
    // the chips are generated from the effect object, so data and engine cannot drift apart by design
    for (const e of EVENT_DEFS) {
      for (const o of e.options) {
        expect(affectsLabels(o.effect).length, `${e.id}/${o.id}`).toBeGreaterThan(0);
        if (o.protectedEffect) {
          expect(affectsLabels(o.protectedEffect, protectionNote(e.protectedBy)).length, `${e.id}/${o.id} protected`).toBeGreaterThan(0);
        }
      }
    }
  });

  it("no real example is waiting for a fact check", () => {
    expect(EVENT_DEFS.filter((e) => e.verify).map((e) => e.id)).toEqual([]);
  });
});

describe("the chips a real option produces", () => {
  const chips = (eventId: string, optionId: string, shielded = false) => {
    const e = EVENT_DEFS.find((x) => x.id === eventId)!;
    const o = e.options.find((x) => x.id === optionId)!;
    return affectsLabels(shielded ? o.protectedEffect! : o.effect, shielded ? protectionNote(e.protectedBy) : undefined);
  };

  it("says exactly what each kind of choice costs or wins", () => {
    expect(chips("dust", "shake")).toEqual(["Fuel −5 kg"]); // a plain cost
    // a lasting cost, and the science it quietly takes with it
    expect(chips("lostSignal", "guess")).toEqual([
      "Signal −20% for the rest of the trip", "Science −20% (less data reaches Earth)",
    ]);
    expect(chips("solarStorm", "risky")).toEqual(["1 in 4 chance of losing the spacecraft"]); // a gamble
    expect(chips("solarStorm", "risky", true)).toEqual(["1 in 20 chance of losing the spacecraft"]); // the same gamble, protected
    expect(chips("solarStorm", "safe", true)).toEqual(["No cost — backup systems handle it"]); // the design handles it
    // a chance worth taking: what it wins first, what it costs after
    expect(chips("gravityAssist", "take")).toEqual([
      "Fuel saved: 60 kg", "+30 days", "1 in 10 chance of missing {target}",
    ]);
    expect(chips("bonusTarget", "turn")).toEqual(["Science +15%", "Fuel −4 kg", "+3 days"]);
    expect(chips("assistCheck", "burn")).toEqual([
      "Fixes the aim: no chance of missing {target}", "Fuel −7 kg",
    ]);
    expect(chips("gravityAssist", "direct")).toEqual(["No cost"]); // doing nothing at all
  });
});

describe("affects labels", () => {
  it("cover every effect key in the words the card uses", () => {
    expect(affectsLabels({ fuelCost: 8, sciencePenalty: 0.1, powerPenalty: 0.3, signalPenalty: 0.2, daysLost: 7, riskAtInsertion: 0.3, riskOfFailure: 0.25 })).toEqual([
      "Fuel −8 kg", "Science −10%", "Power −30% for the rest of the trip",
      "Signal −20% for the rest of the trip", "Science −20% (less data reaches Earth)", "+7 days",
      "3 in 10 chance of missing {target}", "1 in 4 chance of losing the spacecraft",
    ]);
    // a weaker signal really does cost science: insertionBurn multiplies the score by signalFactor
    expect(affectsLabels({ signalPenalty: 0.2 })).toEqual(["Signal −20% for the rest of the trip", "Science −20% (less data reaches Earth)"]);
    // whole days, and one day is a day
    expect(affectsLabels({ daysLost: 1 })).toEqual(["+1 day"]);
    expect(affectsLabels({})).toEqual(["No cost"]);
    expect(affectsLabels({ none: true }, "backup systems handle it")).toEqual(["No cost — backup systems handle it"]);
    expect(fillTarget("3 in 10 chance of missing {target}", "Mars")).toBe("3 in 10 chance of missing Mars");
  });

  it("colour by kind: green for no cost, blue for time, amber for a chance, red for a loss", () => {
    expect(affectTone("No cost")).toBe("gain");
    expect(affectTone("+7 days")).toBe("time");
    expect(affectTone("3 in 10 chance of missing Mars")).toBe("risk");
    expect(affectTone("1 in 4 chance of losing the spacecraft")).toBe("risk");
    expect(affectTone("Fuel −8 kg")).toBe("loss");
  });

  it("eventContext returns the three lines, and null for an unknown id", () => {
    const c = eventContext("dust")!;
    expect(c.whatIsIt).toContain("dust storms");
    expect(c.realExample).toContain("2018");
    expect(c.howCommon).toContain("Common");
    expect(c.verify).toBe(false);
    expect(eventContext("nope")).toBeNull();
  });
});

describe("the pool holds together (Stage 9)", () => {
  it("every follow-up points at an event and an option that really exist", () => {
    const followers = EVENT_DEFS.filter((e) => e.follows);
    expect(followers.length).toBeGreaterThan(0);
    for (const e of followers) {
      const cause = EVENT_DEFS.find((c) => c.id === e.follows!.eventId);
      expect(cause, `${e.id} follows an unknown event`).toBeDefined();
      expect(cause!.options.map((o) => o.id), `${e.id} follows an unknown option`).toContain(e.follows!.optionId);
      expect(cause!.follows, `${e.id} follows another follow-up`).toBeUndefined();
      expect(e.chance, `${e.id} is never drawn, so its chance should be 0`).toBe(0);
    }
  });

  it("every onlyIf and protectedBy names a flag a real design can have", () => {
    const flags = new Set<string>();
    for (const sc of scenarios) {
      for (const design of DESIGNS) {
        createSimulation(design, sc, 0, "slow", runChecks(design, sc, 0, "slow"), 1, []).config.flags.forEach((f) => flags.add(f));
      }
    }
    for (const e of EVENT_DEFS) {
      if (e.onlyIf) expect(flags, `${e.id} onlyIf`).toContain(e.onlyIf);
      if (e.protectedBy) expect(flags, `${e.id} protectedBy`).toContain(e.protectedBy);
      for (const o of e.options) if (o.onlyIf) expect(flags, `${e.id}/${o.id} onlyIf`).toContain(o.onlyIf);
    }
  });

  it("every event says what kind it is and when it can happen, and opportunities offer a way out", () => {
    for (const e of EVENT_DEFS) {
      expect(["problem", "opportunity", undefined]).toContain(e.kind);
      expect(["early", "mid", "late", "any", undefined]).toContain(e.phase);
      expect(e.options.length, `${e.id} needs a choice`).toBeGreaterThanOrEqual(2);
      expect(e.options.some((o) => o.safe), `${e.id} needs an option mission control can pick`).toBe(true);
      expect(new Set(e.options.map((o) => o.id)).size, `${e.id} has a repeated option id`).toBe(e.options.length);
    }
    expect(EVENT_DEFS.filter((e) => e.kind === "opportunity").length).toBeGreaterThanOrEqual(3);
  });

  it("every challenge in the pool can really be drawn by some mission", () => {
    const drawn = new Set<string>();
    for (const sc of scenarios) {
      for (const design of DESIGNS) {
        const check = runChecks(design, sc, 0, "slow");
        for (let seed = 1; seed <= 120; seed++) {
          createSimulation(design, sc, 0, "slow", check, seed).upcoming.forEach((u) => drawn.add(u.eventId));
        }
      }
    }
    const shouldBeDrawable = EVENT_DEFS.filter((e) => !e.follows).map((e) => e.id);
    expect([...shouldBeDrawable].filter((id) => !drawn.has(id))).toEqual([]);
    // and a follow-up is never drawn on its own, whatever the seed
    expect([...drawn].filter((id) => EVENT_DEFS.find((e) => e.id === id)!.follows)).toEqual([]);
  });

  it("an option that risks the spacecraft is never the one mission control picks", () => {
    for (const e of EVENT_DEFS) {
      for (const o of e.options) {
        if (o.safe) expect(o.effect.riskOfFailure ?? 0, `${e.id}/${o.id}`).toBeLessThanOrEqual(0.05);
      }
    }
  });
});
