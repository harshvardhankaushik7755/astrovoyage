/**
 * The space-view HUD: one readout per gauge, each with its own constant icon, a name and a unit.
 *
 * Two things went wrong here before. The icons on the map are EVENT icons from src/sim/deltas.ts and
 * change with what happened; a gauge must never borrow one, or its symbol would change under the
 * player's eyes. And a marker on the trail is drawn per day, not per decision: two decisions on the
 * same day used to paint the same label twice, which read as doubled digits.
 */
import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { MissionView, GAUGE_ICON } from "../MissionControl";
import { markersByDay } from "../../components/MapEffects";
import { eventIcon } from "../../sim/deltas";
import { createSimulation, resolveEvent, step, EVENT_DEFS, type Decision, type SimState } from "../../sim/simulation";
import { runChecks, findScenario, type Design } from "../../physics/checks";

const noop = () => {};
const MOON: Design = { bodyId: "small", instrumentIds: ["camera", "magnetometer"], powerId: "solarSmall", antennaId: "antSmall", engineId: "chemical", rocketId: "medium", fuelKg: 1400 };

function view(sim: SimState, spaceView: boolean): string {
  return renderToString(
    <MissionView sim={sim} design={MOON} speed={1} onSpeed={noop} fx={{ arrival: null, flash: null, countdown: null, burning: false }}
      instruments={["Camera", "Magnetometer"]} clockOffset={0} clockFlash={false} shake={false} secondsLeft={null}
      contextOpen={false} onToggleContext={noop} openInfo={null} onOpenInfo={noop} spaceView={spaceView} onToggleSpace={noop}
      onDecide={noop} onSeeResults={noop} />,
  );
}

/** A Moon mission with two decisions on the same day, which is what used to double the digits. */
function twoOnOneDay(): SimState {
  const sc = findScenario("moon");
  let s = createSimulation(MOON, sc, 3, "slow", runChecks(MOON, sc, 3, "slow"), 1, [
    { day: 1, eventId: "solarStorm" },
    { day: 1, eventId: "courseDrift" },
  ]);
  s = resolveEvent(step(s, 2), "safe");
  s = resolveEvent(step(s, 0.01), "correct");
  expect(s.decisions.map((d) => d.day)).toEqual([1, 1]);
  return s;
}

describe("every gauge keeps its own icon", () => {
  it("names one constant symbol per gauge, and none of them is an event symbol", () => {
    const eventIcons = new Set(EVENT_DEFS.map((e) => eventIcon(e.id)));
    const gaugeIcons = Object.values(GAUGE_ICON);
    expect(new Set(gaugeIcons).size, "two gauges share an icon").toBe(gaugeIcons.length);
    for (const icon of gaugeIcons) {
      expect(eventIcons, `${icon} is also an event icon`).not.toContain(icon);
    }
  });

  it("shows each icon beside its own gauge in the HUD, and nowhere else", () => {
    const sim = step(createSimulation(MOON, findScenario("moon"), 3, "slow", runChecks(MOON, findScenario("moon"), 3, "slow"), 1, []), 1);
    const hud = view(sim, true);
    // the readout carries a symbol, a name and a unit
    for (const [gauge, icon] of Object.entries(GAUGE_ICON)) {
      expect(hud, `${gauge} lost its icon`).toContain(icon);
    }
    expect(hud).toContain("Fuel");
    expect(hud).toContain(" kg");
    expect(hud).toContain("Power");
    expect(hud).toContain(" W");
    expect(hud).toContain("Signal");
    expect(hud).toContain("Science");
    expect(hud).toContain(" pts");

    // the normal view is unchanged: no icons there
    const normal = view(sim, false);
    for (const icon of Object.values(GAUGE_ICON)) expect(normal, `${icon} leaked into the normal view`).not.toContain(icon);
  });

  it("keeps event marks and instrument chips out of the HUD, so no event symbol can appear in it", () => {
    const sim = twoOnOneDay();
    const hud = view(sim, true);
    const eventIcons = EVENT_DEFS.map((e) => eventIcon(e.id));
    const gauges = hud.slice(hud.indexOf('class="gauges'), hud.indexOf('class="log'));
    for (const icon of eventIcons) {
      expect(gauges, `${icon} appeared in the HUD`).not.toContain(icon);
    }
    expect(gauges).not.toContain('class="mark"');
    expect(gauges).not.toContain('class="instr');
    // and the normal view still has its marks, which is where that story belongs
    expect(view(sim, false)).toContain('class="mark"');
  });
});

describe("a marker on the trail belongs to a day, not to a decision", () => {
  it("draws one marker for a day, whatever happened on it", () => {
    const sim = twoOnOneDay();
    const markers = markersByDay(sim.decisions);
    expect(markers).toHaveLength(1);
    expect(markers[0].day).toBe(1);
    // both icons on the one marker, so nothing is hidden and nothing is drawn twice
    expect(markers[0].icons).toBe(eventIcon("solarStorm") + eventIcon("courseDrift"));

    const svg = view(sim, false);
    expect((svg.match(/data-effect="marker"/g) ?? []).length).toBe(1);
    expect((svg.match(/ Day 1</g) ?? []).length).toBe(1); // the label is painted once, never twice
  });

  it("says Day, so a marker can never be read as a gauge value", () => {
    const svg = view(twoOnOneDay(), false);
    expect(svg).toContain(" Day 1");
    expect(svg).toContain('class="marker-pill"'); // and it sits on a scrim, not bare on the sky
  });

  it("sorts markers by day and keeps one per day", () => {
    const made = (day: number, eventId: string): Decision =>
      ({ day, event: "x", eventId, option: "x", optionId: "x", outcome: "", hurt: false, gain: false, effect: {} });
    const markers = markersByDay([made(9, "dust"), made(2, "solarStorm"), made(9, "courseDrift"), made(2, "lostSignal")]);
    expect(markers.map((m) => m.day)).toEqual([2, 9]);
    expect(markers[0].icons).toBe(eventIcon("solarStorm") + eventIcon("lostSignal"));
  });

  it("draws no markers at all in space view, so nothing rides bare over an orbit", () => {
    const sim = twoOnOneDay();
    expect(view(sim, true)).not.toContain('data-effect="marker"');
    expect(view(sim, false)).toContain('data-effect="marker"');
  });
});
