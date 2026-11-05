import { describe, it, expect, vi } from "vitest";
import {
  buildSummary, explainMission, outcomeOf, compareWithRealMission, fetchFlightDirector,
  type MissionSummary, type Outcome,
} from "../flightDirector";
import { createSimulation, step, resolveEvent, type ScheduledEvent } from "../../sim/simulation";
import { runChecks, findScenario, type Design } from "../../physics/checks";
import realMissions from "../../data/realMissions.json";
import lines from "../../data/directorLines.json";

const MOON_OK: Design = { bodyId: "small", instrumentIds: ["camera", "magnetometer"], powerId: "solarSmall", antennaId: "antSmall", engineId: "chemical", rocketId: "medium", fuelKg: 1400 };
/** Cheapest Mars design that passes every check; almost no fuel to spare. */
const MARS_TIGHT: Design = { bodyId: "small", instrumentIds: ["camera"], powerId: "solarSmall", antennaId: "antLarge", engineId: "chemical", rocketId: "light", fuelKg: 1550 };
/** Camera + radar at Mars: only half the data gets home through the large dish. */
const MARS_POWER: Design = { bodyId: "small", instrumentIds: ["camera", "radar"], powerId: "solarSmall", antennaId: "antLarge", engineId: "chemical", rocketId: "medium", fuelKg: 3000 };
const MONTH: Record<string, number> = { moon: 3, mars: 10, jupiter: 4 };
const at = (day: number, eventId: string): ScheduledEvent[] => [{ day, eventId }];

interface Opts { fly?: boolean; schedule?: ScheduledEvent[]; choose?: Record<string, string>; seed?: number }

/** Build the report for a design, flown to the end (answering challenges with `choose`) or not flown at all. */
function summaryOf(design: Design, scenarioId: string, opts: Opts = {}): MissionSummary {
  const sc = findScenario(scenarioId);
  const month = MONTH[scenarioId];
  const check = runChecks(design, sc, month, "slow");
  if (opts.fly === false) return buildSummary(null, design, sc, month, "slow", check);
  let s = createSimulation(design, sc, month, "slow", check, opts.seed ?? 1, opts.schedule ?? []);
  for (let i = 0; i < 10_000 && s.phase !== "orbit" && s.phase !== "failed"; i++) {
    s = s.pendingEvent ? resolveEvent(s, opts.choose?.[s.pendingEvent.id] ?? s.pendingEvent.options[0].id) : step(s, 1);
  }
  return buildSummary(s, design, sc, month, "slow", check);
}

/** A seed for which the given choice ends in failure. */
function failingSeed(design: Design, scenarioId: string, schedule: ScheduledEvent[], choose: Record<string, string>): number {
  for (let seed = 1; seed <= 200; seed++) {
    if (summaryOf(design, scenarioId, { schedule, choose, seed }).flight.outcome === "failed") return seed;
  }
  throw new Error("no failing seed found");
}

describe("the ten common outcomes", () => {
  const cases: Partial<Record<Outcome, () => MissionSummary>> = {
    insertionFuel: () => summaryOf(MARS_TIGHT, "mars", { schedule: at(50, "courseDrift"), choose: { courseDrift: "correct" } }),
    powerLow: () => summaryOf({ ...MOON_OK, rocketId: "heavy", fuelKg: 4000 }, "jupiter", { fly: false }),
    weakAntenna: () => summaryOf(MARS_POWER, "mars"),
    stormNoBackup: () => {
      const choose = { solarStorm: "risky" };
      return summaryOf(MOON_OK, "moon", { schedule: at(1, "solarStorm"), choose, seed: failingSeed(MOON_OK, "moon", at(1, "solarStorm"), choose) });
    },
    dustIgnored: () => summaryOf(MARS_TIGHT, "mars", { schedule: at(10, "dust"), choose: { dust: "nothing" } }),
    driftIgnored: () => {
      const choose = { courseDrift: "ignore" };
      return summaryOf(MOON_OK, "moon", { schedule: at(1, "courseDrift"), choose, seed: failingSeed(MOON_OK, "moon", at(1, "courseDrift"), choose) });
    },
    overCarriedFuel: () => summaryOf({ ...MOON_OK, fuelKg: 5000 }, "moon"),
    overSizedPanels: () => summaryOf({ ...MOON_OK, powerId: "solarLarge" }, "moon"),
    perfect: () => summaryOf(MOON_OK, "moon"),
    overBudget: () => summaryOf({ ...MOON_OK, powerId: "rtg", rocketId: "heavy" }, "moon", { fly: false }),
  };

  it("are recognised, and each gets its own explanation of 3 to 5 sentences", () => {
    const texts = new Set<string>();
    for (const [expected, make] of Object.entries(cases)) {
      const s = make!();
      expect(outcomeOf(s), expected).toBe(expected);
      const text = explainMission(s);
      expect(text.length, expected).toBeGreaterThan(40);
      const sentences = (text.match(/[.!?](\s|$)/g) ?? []).length;
      expect(sentences, `${expected}: ${text}`).toBeGreaterThanOrEqual(3);
      expect(sentences, `${expected}: ${text}`).toBeLessThanOrEqual(5);
      texts.add(text);
    }
    expect(texts.size).toBe(Object.keys(cases).length);
  });

  it("fills every blank in every sentence, and has a tip for every outcome", () => {
    for (const [expected, make] of Object.entries(cases)) {
      const text = explainMission(make!());
      expect(text, expected).not.toContain("{"); // a missing value would leave the placeholder behind
      expect(text, expected).not.toContain("}");
      expect(text, expected).not.toMatch(/\s\s/); // or an empty gap where a word should be
      expect(lines.tips[expected as keyof typeof lines.tips], expected).toBeTruthy();
      expect(lines.why[expected as keyof typeof lines.why], expected).toBeTruthy();
    }
    // the second wording each two-way case picks between
    for (const key of ["weakAntennaNoBigger", "driftIgnoredLost", "perfectSomeDataLost", "goodOverPlan"]) {
      expect(lines.why[key as keyof typeof lines.why], key).toBeTruthy();
    }
    for (const key of ["chanceThatCaused", "cause", "chance", "everySafe", "everyGood", "best", "riskiest"]) {
      expect(lines.decisions[key as keyof typeof lines.decisions], key).toBeTruthy();
    }
  });

  it("never calls a safe choice the worst one — it is the price of safety", () => {
    const s = summaryOf(MOON_OK, "moon", {
      schedule: [{ day: 1, eventId: "solarStorm" }, { day: 2, eventId: "courseDrift" }],
      choose: { solarStorm: "safe", courseDrift: "correct" },
    });
    const text = explainMission(s);
    expect(text).not.toContain("worst choice");
    expect(text).toContain("Every choice was the safe one");
    expect(text).toContain("price of safety");
    expect(text).toContain("did this for real");
  });

  it("names the riskiest choice only when a risky option was taken", () => {
    const s = summaryOf(MOON_OK, "moon", {
      schedule: [{ day: 1, eventId: "courseDrift" }, { day: 2, eventId: "lostSignal" }],
      choose: { courseDrift: "correct", lostSignal: "guess" },
    });
    const text = explainMission(s);
    expect(text).toContain("Your best choice was on day 1: correction burn");
    expect(text).toContain("Your riskiest choice was on day 2:");
    expect(text).not.toContain("worst choice");
  });

  it("praises a flight where every call was good", () => {
    const s = summaryOf(MOON_OK, "moon", { schedule: at(1, "courseDrift"), choose: { courseDrift: "correct" } });
    expect(explainMission(s)).toContain("Every choice you made on the way was a good one");
  });
});

describe("the mission report", () => {
  it("has the expected sections and nothing personal", () => {
    const s = summaryOf(MOON_OK, "moon");
    expect(Object.keys(s)).toEqual(["scenario", "design", "checks", "flight", "score", "plan", "realMissions"]);
    expect(s.plan?.goal).toBe("Map the Moon");
    expect(s.design.instruments).toEqual(["Camera", "Magnetometer"]);
    expect(s.flight.outcome).toBe("orbit");
    expect(s.score.starCount).toBe(3);
    const json = JSON.stringify(s);
    expect(json).not.toMatch(/@|email/i);
    expect(json.length).toBeLessThan(6000);
  });

  it("marks a design that was never flown", () => {
    const s = summaryOf(MOON_OK, "moon", { fly: false });
    expect(s.flight.outcome).toBe("not flown");
    expect(s.flight.decisions).toEqual([]);
    expect(s.flight.scienceCollected).toBe(18);
  });
});

describe("compare with the real mission", () => {
  const juno = realMissions.find((m) => m.id === "juno")!;

  it("matches the example from the design brief", () => {
    expect(compareWithRealMission({ powerType: "solar", rocket: "heavy", target: "Jupiter" }, juno))
      .toBe("You used solar panels at Jupiter, like Juno. Like Juno, you also flew on a heavy rocket.");
    expect(compareWithRealMission({ powerType: "rtg", rocket: "light", target: "Jupiter" }, juno))
      .toBe("Juno used solar panels, but you chose a nuclear battery.");
  });

  it("every report carries one comparison per real mission", () => {
    const s = summaryOf(MOON_OK, "moon");
    expect(s.realMissions.map((m) => m.name)).toEqual(["Chandrayaan-2 Orbiter", "Lunar Reconnaissance Orbiter"]);
    expect(s.realMissions[0].comparison).toContain("like Chandrayaan-2 Orbiter");
  });
});

describe("fetchFlightDirector (the AI path)", () => {
  const summary = summaryOf(MOON_OK, "moon");
  const reply = (body: unknown, ok = true) => (async () => ({ ok, json: async () => body })) as unknown as typeof fetch;

  it("posts the report and returns the text the server sent", async () => {
    const f = vi.fn(reply({ text: "  Nice flight!  " }));
    expect(await fetchFlightDirector(summary, "http://x/explain", 1000, f)).toBe("Nice flight!");
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://x/explain");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body)).scenario.id).toBe("moon");
  });

  it("returns null on a bad status, a network error, an empty answer, or a timeout", async () => {
    expect(await fetchFlightDirector(summary, "u", 1000, reply({ text: "x" }, false))).toBeNull();
    expect(await fetchFlightDirector(summary, "u", 1000, (async () => { throw new Error("down"); }) as unknown as typeof fetch)).toBeNull();
    expect(await fetchFlightDirector(summary, "u", 1000, reply({ text: "   " }))).toBeNull();
    expect(await fetchFlightDirector(summary, "u", 1000, reply({ nope: 1 }))).toBeNull();

    const slow = ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(new Error("aborted"))))) as unknown as typeof fetch;
    const t0 = Date.now();
    expect(await fetchFlightDirector(summary, "u", 30, slow)).toBeNull();
    expect(Date.now() - t0).toBeLessThan(1000);
  });
});

describe("the big dish far away", () => {
  it("is not blamed when nothing bigger exists and the design already sends what it can", () => {
    const jupiter: Design = { bodyId: "small", instrumentIds: ["camera", "magnetometer"], powerId: "solarLarge", antennaId: "antLarge", engineId: "chemical", rocketId: "medium", fuelKg: 3500 };
    const s = summaryOf(jupiter, "jupiter");
    expect(s.checks.commsFraction).toBeCloseTo(0.67, 2);
    expect(s.checks.biggerAntennaExists).toBe(false);
    expect(outcomeOf(s)).toBe("perfect");
    expect(explainMission(s)).toContain("everything the antenna could manage");
    const small = summaryOf({ ...jupiter, antennaId: "antSmall" }, "jupiter", { fly: false });
    expect(outcomeOf(small)).toBe("weakAntenna");
    expect(explainMission(small)).toContain("large dish antenna sends ten times more");
  });
});

describe("the oversized-panels sentence judges the panels you bought", () => {
  it("reports the Design Lab figure even after a challenge cut the power in flight", () => {
    // large panels on the Moon, where the small ones would do, and sunlight pushes the spacecraft
    // off course on the way: tilting them to fix it costs 10% of the power for the rest of the trip
    const s = summaryOf({ ...MOON_OK, powerId: "solarLarge" }, "moon", {
      schedule: at(1, "sunPush"),
      choose: { sunPush: "tilt" },
    });
    expect(outcomeOf(s)).toBe("overSizedPanels");
    expect(s.flight.decisions.some((d) => d.effect.powerPenalty), "the flight must really have lost power").toBe(true);
    expect(s.flight.powerAtTargetW).toBeLessThan(s.checks.powerMadeW);

    const text = explainMission(s);
    // the same number the Design Lab shows for these panels, not the reduced in-flight one
    const design = runChecks({ ...MOON_OK, powerId: "solarLarge" }, findScenario("moon"), 3, "slow");
    expect(s.checks.powerMadeW).toBe(design.power.limit);
    expect(text).toContain(`make ${design.power.limit} W`);
    expect(text).not.toContain(`make ${s.flight.powerAtTargetW} W`);
  });

  it("the sentence about not enough power still reports what the flight actually made", () => {
    // the same design the power-low case uses, flown, with the tilt that costs 10% of the power
    const design: Design = { ...MOON_OK, instrumentIds: ["camera", "radar"], powerId: "solarLarge", antennaId: "antLarge", rocketId: "heavy", fuelKg: 5000 };
    const s = summaryOf(design, "jupiter", { schedule: at(100, "sunPush"), choose: { sunPush: "tilt" } });
    expect(outcomeOf(s)).toBe("powerLow");
    expect(s.flight.powerAtTargetW).toBeLessThan(s.checks.powerMadeW);
    // this sentence is about the flight, so it uses the reduced figure, not the one from the Design Lab
    expect(explainMission(s)).toContain(`make ${s.flight.powerAtTargetW} W`);
  });
});

describe("the words live in src/data/directorLines.json", () => {
  it("holds the words for the real-mission comparison too", () => {
    const text = compareWithRealMission({ powerType: "rtg", rocket: "heavy", target: "Jupiter" }, { name: "Juno", power: "solar", rocket: "heavy" });
    expect(text).not.toContain("{");
    expect(text).toContain("Juno used solar panels, but you chose a nuclear battery.");
    expect(text).toContain("Like Juno, you also flew on a heavy rocket.");
  });
});

describe("Stage 9: chances, chains and a full score", () => {
  it("names the choice a follow-up came from, without doubling the article", () => {
    // "The new instrument is working well" already starts with "The"
    const s = summaryOf(MOON_OK, "moon", {
      schedule: [{ day: 0.5, eventId: "bonusTarget" }, { day: 1, eventId: "extraData" }],
      choose: { bonusTarget: "turn", extraData: "keep" },
    });
    const text = explainMission(s);
    expect(text).not.toContain("The the ");
    expect(text).toContain("the new instrument is working well on day");
    // the chance taken and the cause are the same choice, so it is one sentence, not two
    expect(text).toContain("Taking the chance on day 1 paid off and brought");
    expect(text).not.toContain("You took the chance on day 1 and it paid off");
    expect(text).not.toContain("On day 1 you chose"); // that choice is already in the sentence above
    expect((text.match(/turn and photograph/g) ?? []).length).toBeLessThanOrEqual(1);
  });

  it("gives an event whose name has no article one, and names both choices when they differ", () => {
    const s = summaryOf(MOON_OK, "moon", {
      schedule: [{ day: 0.5, eventId: "debris" }, { day: 1.5, eventId: "debrisDamage" }],
      choose: { debris: "hold", debrisDamage: "less" },
    });
    const text = explainMission(s);
    expect(text).toContain("The damage found on day");
    expect(text).toContain("came from your choice on day 1: hold course");
    expect(text).not.toContain("The the ");
  });

  it("says an over-plan score as a win, and the stars and score still add up", () => {
    // two chances taken, and one card that cost something: the science still comes home above the plan
    const s = summaryOf(MOON_OK, "moon", {
      schedule: [{ day: 0.5, eventId: "bonusTarget" }, { day: 1, eventId: "extraData" }, { day: 1.5, eventId: "micrometeoroid" }],
      choose: { bonusTarget: "turn", extraData: "send", micrometeoroid: "turn" },
    });
    expect(outcomeOf(s)).toBe("good");
    expect(s.flight.scienceCollected).toBeGreaterThan(s.flight.scienceMax);
    const text = explainMission(s);
    expect(text).not.toMatch(/\d+ of \d+ science points/); // never "22 of 18"
    expect(text).toContain(`collected ${s.flight.scienceCollected} science points`);
    expect(text).toContain(`more than the ${s.flight.scienceMax} you planned for`);

    // the score counts every point, and the stars are not confused by going over
    expect(s.score.science).toBe(s.flight.scienceCollected);
    expect(s.score.score).toBe(Math.round(s.flight.scienceCollected + s.score.moneyLeft));
    expect(s.score.successFraction).toBe(1);
    expect(s.score.stars.reached).toBe(true);
    expect(s.score.stars.fullSuccess).toBe(true);
    expect(s.score.starCount).toBeLessThanOrEqual(3);
  });

  it("never sends a player hunting for points that are not missing", () => {
    // a chance taken can push the science to the top even after a card cost some, and then the tip has to say something else
    const full = summaryOf(MOON_OK, "moon", {
      schedule: [{ day: 0.5, eventId: "bonusTarget" }, { day: 1, eventId: "micrometeoroid" }],
      choose: { bonusTarget: "turn", micrometeoroid: "turn" },
    });
    expect(outcomeOf(full)).toBe("good");
    expect(full.flight.scienceCollected).toBeGreaterThanOrEqual(full.flight.scienceMax);
    const text = explainMission(full);
    expect(text).not.toContain("missing points");
    expect(text).toContain("every science point there was");

    // and when points really are missing, the old tip stands
    const short = summaryOf(MOON_OK, "moon", { schedule: at(1, "solarStorm"), choose: { solarStorm: "safe" } });
    expect(short.flight.scienceCollected).toBeLessThan(short.flight.scienceMax);
    expect(explainMission(short)).toContain("where the missing points went");
  });
});
