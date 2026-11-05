import { describe, it, expect } from "vitest";
import { decisionDeltas, gaugeMarks, deltaChips, eventIcon } from "../deltas";
import { demoSchedule, isDemo, DEMO_EVENTS } from "../demo";
import type { Decision, EventEffect } from "../simulation";

const decision = (effect: EventEffect, extra: Partial<Decision> = {}): Decision => ({
  day: 12, event: "Dust on the solar panels", eventId: "dust", option: "Do nothing", optionId: "nothing",
  outcome: "Power down 30%.", hurt: true, gain: false, effect, ...extra,
});

describe("decisionDeltas", () => {
  it("names every kind of change with its gauge and tone", () => {
    const d = decision({ fuelCost: 8, powerPenalty: 0.3, signalPenalty: 0.2, sciencePenalty: 0.1, daysLost: 7, riskAtInsertion: 0.3, riskOfFailure: 0.25 });
    expect(decisionDeltas(d)).toEqual([
      { gauge: "fuel", label: "−8 kg fuel", tone: "loss" },
      { gauge: "power", label: "−30% power", tone: "loss" },
      { gauge: "signal", label: "−20% signal", tone: "loss" },
      { gauge: "science", label: "−10% science", tone: "loss" },
      { gauge: "clock", label: "+7 days", tone: "loss" },
      { gauge: "arrival", label: "3 in 10 chance of missing", tone: "risk" },
      { gauge: "science", label: "risk taken", tone: "risk" },
    ]);
  });

  it("says no harm done on the home gauge of the challenge when nothing changed", () => {
    expect(decisionDeltas(decision({}))).toEqual([{ gauge: "power", label: "no harm done", tone: "gain" }]);
    expect(decisionDeltas(decision({ none: true }, { eventId: "lostSignal" }))[0].gauge).toBe("signal");
    expect(decisionDeltas(decision({}, { eventId: "courseDrift" }))[0].gauge).toBe("arrival");
    expect(decisionDeltas(decision({}, { eventId: "solarStorm" }))[0].gauge).toBe("science");
  });
});

describe("gaugeMarks and deltaChips", () => {
  it("keeps one mark per lasting effect, with the day and the full sentence", () => {
    const marks = gaugeMarks([decision({ powerPenalty: 0.3 }), decision({ fuelCost: 5, sciencePenalty: 0.1 }, { day: 20, eventId: "instrumentFault" })]);
    expect(marks.map((m) => [m.gauge, m.text])).toEqual([
      ["power", "−30% since day 12"],
      ["science", "−10% on day 20"],
      ["fuel", "−5 kg on day 20"],
    ]);
    expect(marks[0].sentence).toBe("Do nothing. Power down 30%.");
    expect(marks[0].icon).toBe(eventIcon("dust"));
  });

  it("writes short chips for the results list", () => {
    expect(deltaChips(decision({ fuelCost: 5, sciencePenalty: 0.1, daysLost: 7 }))).toEqual(["Fuel −5 kg", "Science −10%", "+7 days"]);
    expect(deltaChips(decision({ riskOfFailure: 0.25 }))).toEqual(["25% risk taken"]);
    expect(deltaChips(decision({ riskAtInsertion: 0.3 }))).toEqual(["3 in 10 chance of missing"]);
    expect(deltaChips(decision({}))).toEqual([]);
  });

  it("has an icon for every challenge", () => {
    for (const id of DEMO_EVENTS) expect(eventIcon(id)).not.toBe("•");
    expect(eventIcon("unknown")).toBe("•");
  });
});

describe("demo mode", () => {
  it("fires all five cards early, in order, spread 8% of the trip apart", () => {
    const s = demoSchedule(100);
    expect(s.map((e) => e.eventId)).toEqual(DEMO_EVENTS);
    expect(s.map((e) => e.day)).toEqual([4, 12, 20, 28, 36]);
    // the whole run is over well inside the first half of the cruise, whatever the trip length
    expect(demoSchedule(336).every((e) => e.day <= 336 * 0.4)).toBe(true);
  });

  it("is switched on by ?demo=1 only", () => {
    expect(isDemo("?demo=1")).toBe(true);
    expect(isDemo("?x=2&demo=1")).toBe(true);
    expect(isDemo("?demo=0")).toBe(false);
    expect(isDemo("")).toBe(false);
  });
});
