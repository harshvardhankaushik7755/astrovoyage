/**
 * Stage 8 on screen: every challenge card shows "What is this?", a real story with a year, a how-common badge
 * and coloured chips under each option; the log line gets an ℹ button; the results repeat the chips and the story.
 * The Launch and Design Lab screens carry their new one-screen structure (accordion, side-by-side, Learn more).
 */
import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { MissionView, scienceValue } from "../MissionControl";
import { ResultView } from "../Result";
import { Launch } from "../Launch";
import { DesignLab } from "../DesignLab";
import { ChooseMission } from "../ChooseMission";
import { useGame } from "../../store/gameStore";
import { buildSummary, explainMission } from "../../ai/flightDirector";
import { createSimulation, resolveEvent, step, EVENT_DEFS, type SimState } from "../../sim/simulation";
import { runChecks, findScenario, type Design } from "../../physics/checks";
import { eventContext, affectsLabels, affectTone, fillTarget } from "../../sim/context";
import events from "../../data/events.json";
import parts from "../../data/parts.json";
import scenarios from "../../data/scenarios.json";
import { missionChips, shipLine } from "../../physics/missionFacts";
import { bodyEffect } from "../../physics/partEffects";

const noop = () => {};
/** Every challenge can happen to this design: two instruments (a fault is not covered by a spare), solar panels (dust). */
const MOON_ALL: Design = { bodyId: "small", instrumentIds: ["camera", "magnetometer"], powerId: "solarSmall", antennaId: "antSmall", engineId: "chemical", rocketId: "medium", fuelKg: 1400 };
const count = (s: string, needle: string) => s.split(needle).length - 1;
const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

function withEvent(eventId: string): SimState {
  const sc = findScenario("moon");
  const check = runChecks(MOON_ALL, sc, 3, "slow");
  const sim = step(createSimulation(MOON_ALL, sc, 3, "slow", check, 1, [{ day: 1, eventId }]), 2);
  expect(sim.pendingEvent?.id, eventId).toBe(eventId);
  return sim;
}

function html(sim: SimState, contextOpen = true, openInfo: number | null = null): string {
  return renderToString(
    <MissionView sim={sim} design={MOON_ALL} speed={1} onSpeed={noop} fx={{ arrival: sim.pendingEvent?.id ?? null, flash: null, countdown: null, burning: false }}
      instruments={["Camera", "Magnetometer"]} clockOffset={0} clockFlash={false} shake={false} secondsLeft={10}
      contextOpen={contextOpen} onToggleContext={noop} openInfo={openInfo} onOpenInfo={noop} spaceView={false} onToggleSpace={noop} onDecide={noop} onSeeResults={noop} />,
  );
}

describe("challenge card context", () => {
  it.each(events.map((e) => e.id))("%s: what it is, a real story with a year, how common, and chips under every option", (id) => {
    const sim = withEvent(id);
    const h = html(sim);
    const ctx = eventContext(id)!;
    expect(h).toContain("Why does this happen?");
    expect(h).toContain('aria-expanded="true"');
    expect(h).toContain("What is this?");
    expect(h).toContain(escape(ctx.whatIsIt));
    expect(h).toContain("Real story:");
    expect(h).toContain(escape(ctx.realExample)); // whether a story names a year is checked in the data test
    expect(h).toContain(`<span class="tag common">${escape(ctx.howCommon)}</span>`);
    expect(h).toContain(`<span class="tag">Day ${sim.pendingEvent!.day}</span>`);
    // every option shows its chips, coloured by kind
    for (const o of sim.pendingEvent!.options) {
      for (const label of affectsLabels(o.effect, o.shielded ? "your design handles it" : undefined)) {
        const filled = fillTarget(label, "the Moon");
        if (label.startsWith("No cost —")) continue; // the note depends on the protection; checked below
        expect(h, `${id}/${o.id}: ${filled}`).toContain(`<span class="affect ${affectTone(filled)}">${escape(filled)}</span>`);
      }
    }
    expect(count(h, 'class="affect ')).toBeGreaterThanOrEqual(sim.pendingEvent!.options.length);
  });

  it("the context lines fold away when the toggle is closed, the chips stay", () => {
    const h = html(withEvent("solarStorm"), false);
    expect(h).toContain("Why does this happen?");
    expect(h).toContain('aria-expanded="false"');
    expect(h).not.toContain("What is this?");
    expect(h).not.toContain("Real story:");
    expect(h).toContain('class="affect ');
  });

  it("a protected option says who handled it", () => {
    const sc = findScenario("jupiter");
    const design: Design = { bodyId: "medium", instrumentIds: ["camera", "magnetometer", "spectrometer"], powerId: "rtg", antennaId: "antLarge", engineId: "ion", rocketId: "heavy", fuelKg: 6000 };
    const check = runChecks(design, sc, 0, "slow");
    const sim = step(createSimulation(design, sc, 0, "slow", check, 1, [{ day: 100, eventId: "lostSignal" }]), 150);
    expect(sim.pendingEvent?.id).toBe("lostSignal");
    const h = html(sim);
    expect(h).toContain("No cost — the big dish handles it");
    expect(h).toContain('<span class="affect time">+7 days</span>');
    expect(html(withEvent("courseDrift"))).toContain("3 in 10 chance of missing the Moon");
  });

  it("the status line sits in the top bar with an icon, and there is one Space view button", () => {
    const h = html(withEvent("dust"));
    expect(h).toContain('class="topbar cockpit-bar"');
    expect(h).toContain("Paused: Dust on the solar panels. Decide what to do.");
    expect(h).toContain("⛶ Space view");
    expect(h).not.toContain("Fullscreen"); // one button, not two
    expect(h).toContain('class="overlay on-map"');
    expect(h).toContain('class="cockpit"');
  });
});

describe("mission log ℹ", () => {
  it("every challenge line in the log gets an info button, other lines do not", () => {
    let sim = withEvent("courseDrift");
    sim = resolveEvent(sim, "correct");
    const h = html(sim);
    expect(h).toContain('aria-label="More about: Course drift"');
    expect(count(h, 'class="info"')).toBe(1);
    expect(h).not.toContain('class="popover"');
    expect(h).toContain('aria-label="Mission log, newest first"'); // the strip can be scrolled with the keyboard
  });

  it("opening one shows the same three lines in a popover on that log line", () => {
    let sim = withEvent("dust");
    sim = resolveEvent(sim, "shake");
    const line = sim.log.findIndex((l) => l.text.startsWith("Dust on the solar panels!"));
    const h = html(sim, true, line);
    const ctx = eventContext("dust")!;
    expect(h).toContain('id="log-popover"');
    expect(h).toContain('aria-controls="log-popover"');
    expect(h).toContain('aria-expanded="true"');
    expect(h).toContain('aria-label="About dust on the solar panels"');
    expect(h).toContain(escape(ctx.whatIsIt));
    expect(h).toContain(escape(ctx.realExample));
    expect(h).toContain(escape(ctx.howCommon));
    expect(h).toContain('aria-label="Close"');
    // it belongs to its own log line, so a screen reader reads it right after that line
    expect(h.indexOf("Dust on the solar panels!")).toBeLessThan(h.indexOf('id="log-popover"'));
  });

  it("a line that is not a challenge never opens a popover", () => {
    const sim = withEvent("dust");
    const plain = sim.log.findIndex((l) => l.text.startsWith("Left Earth"));
    expect(plain).toBeGreaterThanOrEqual(0);
    expect(html(sim, true, plain)).not.toContain('class="popover"');
  });
});

describe("results repeat the lesson", () => {
  it("each decision shows its chips and the one-line real story", () => {
    const sc = findScenario("moon");
    const check = runChecks(MOON_ALL, sc, 3, "slow");
    let s = createSimulation(MOON_ALL, sc, 3, "slow", check, 1, [{ day: 1, eventId: "solarStorm" }, { day: 2, eventId: "dust" }]);
    for (let i = 0; i < 100 && s.phase !== "orbit" && s.phase !== "failed"; i++) {
      s = s.pendingEvent ? resolveEvent(s, s.pendingEvent.id === "solarStorm" ? "safe" : "shake") : step(s, 1);
    }
    const summary = buildSummary(s, MOON_ALL, sc, 3, "slow", check);
    const h = renderToString(<ResultView summary={summary} director={{ text: explainMission(summary), source: "rules" }} onImprove={noop} onNew={noop} />);
    expect(h).toContain('class="result-grid"');
    expect(h).toContain('<span class="affect loss">Science −10%</span>');
    expect(h).toContain('<span class="affect loss">Fuel −5 kg</span>');
    expect(h).toContain("Real story: " + escape(eventContext("solarStorm")!.realExample));
    expect(h).toContain("Real story: " + escape(eventContext("dust")!.realExample));
    expect(h).toContain("Improve this design");
  });
});

describe("the four-step strip", () => {
  it("shows where the mission is, with one current step", () => {
    const flying = html(withEvent("dust"));
    expect(flying).toContain('class="timeline"');
    expect(flying).toContain("Arrival burn");
    expect(count(flying, 'class="step current"')).toBe(1);
    expect(flying).toContain('aria-current="step"');
    expect(flying).toContain('aria-label="Mission progress: Cruise"');

    let done = withEvent("dust");
    done = resolveEvent(done, "shake");
    for (let i = 0; i < 100 && done.phase !== "orbit" && done.phase !== "failed"; i++) done = step(done, 1);
    done = step(done, 0);
    expect(done.phase).toBe("orbit");
    const end = html(done);
    expect(count(end, 'class="step done"')).toBe(4);
    expect(count(end, 'class="step current"')).toBe(0);
  });
});

describe("the spacecraft follows the player", () => {
  const line = (h: string) => h.slice(h.indexOf('class="ship-line"'), h.indexOf('class="ship-line"') + 600);

  it("says every part of the design, on one line", () => {
    const h = html(withEvent("dust"));
    const l = line(h);
    expect(l).toContain("Moon");
    expect(l).toContain("Chemical engine");
    expect(l).toContain("2 instruments");
    expect(l).toContain("Small antenna");
    expect(l).toContain("Fuel ");
    expect(l).toContain("Δv ");
    expect(h).toContain('aria-label="Your spacecraft: Moon, Chemical engine, 2 instruments, Small antenna, Fuel');
  });

  it("the fuel number is the live one, and there is no Edit button once the mission is flying", () => {
    const before = withEvent("dust");
    expect(line(html(before))).toContain(`Fuel ${Math.round(before.fuelKg).toLocaleString()} kg`);
    expect(html(before)).not.toContain("ship-edit");

    const after = resolveEvent(before, "shake"); // burns 5 kg
    expect(after.fuelKg).toBeLessThan(before.fuelKg);
    expect(line(html(after))).toContain(`Fuel ${Math.round(after.fuelKg).toLocaleString()} kg`);
  });

  it("one instrument is not called 1 instruments", () => {
    const sc = findScenario("mars");
    const one: Design = { ...MOON_ALL, instrumentIds: ["camera"], antennaId: "antLarge", fuelKg: 1800, rocketId: "light" };
    const check = runChecks(one, sc, 10, "slow");
    const parts = shipLine(one, sc, check, 1800);
    expect(parts.find((p) => p.id === "instruments")!.text).toBe("1 instrument");
    expect(parts.find((p) => p.id === "target")!.text).toBe("Mars");
    expect(parts.find((p) => p.id === "fuel")!.text).toBe("Fuel 1,800 kg");
    // the two parts a narrow screen keeps are the target and the engine
    expect(parts.filter((p) => p.always).map((p) => p.id)).toEqual(["target", "engine"]);
  });

  it("the Launch screen shows it with a way back to the Design Lab", () => {
    const g = useGame.getState();
    g.reset();
    g.pickScenario("mars");
    g.loadPreset();
    const h = renderToString(<Launch />);
    expect(h).toContain('class="ship-line"');
    expect(h).toContain("ship-edit");
    expect(h).toContain(">Edit<");
  });
});

describe("Choose mission shows how hard each one is", () => {
  it("every card carries its three chips, coloured by the numbers", () => {
    const h = renderToString(<ChooseMission />);
    for (const sc of scenarios) {
      for (const c of missionChips(sc)) {
        expect(h, `${sc.id}: ${c.label}`).toContain(`<span class="affect ${c.tone}"`);
        expect(h).toContain(escape(c.label));
      }
    }
    expect(count(h, "mission-chips")).toBe(scenarios.length);
    expect(count(h, 'class="affect ')).toBe(scenarios.length * 3);
    // the Moon is measured in seconds, Jupiter in minutes
    expect(h).toContain("Signal: 1.3 seconds");
    expect(h).toContain("Signal: 43 minutes");
    // budget and trip stay as plain text above the chips
    expect(h).toContain("Budget:");
    expect(h).toContain("Trip:");
  });
});

describe("Launch and Design Lab one-screen structure", () => {
  it("Launch: calendar beside the route, checks below, real missions behind Learn more", () => {
    const g = useGame.getState();
    g.reset();
    g.pickScenario("mars");
    g.loadPreset();
    const h = renderToString(<Launch />);
    expect(h).toContain('class="launch-top"');
    expect(h).toContain('class="checks-grid"');
    expect(h).toContain("<details");
    expect(h).toContain("Learn more: real missions to compare");
    expect(h).not.toContain("<details open");
    expect(count(h, 'class="month')).toBe(36);
    expect(h).toContain("Launch! 🚀");
  });

  it("Design Lab: every part card carries the line the physics wrote for it", () => {
    const g = useGame.getState();
    g.reset();
    g.pickScenario("moon");
    g.loadPreset();
    const h = renderToString(<DesignLab />);
    // the body group is the one open on arrival: every card in it shows its own effect line
    expect(count(h, 'class="effect"')).toBe(parts.bodies.length);
    for (const b of parts.bodies) expect(h).toContain(escape(bodyEffect(b)));
    expect(h).toContain("protects you from a solar storm"); // the large bus, which events.json calls "backup"
    // the closed groups are not rendered at all, so nothing stale can be on screen
    expect(h).not.toContain("Makes about");
  });

  it("Design Lab: six accordion headers, one open, each header summarises the choice", () => {
    const g = useGame.getState();
    g.reset();
    g.pickScenario("moon");
    g.loadPreset();
    const h = renderToString(<DesignLab />);
    expect(count(h, 'class="acc-head"')).toBe(6);
    expect(count(h, 'aria-expanded="true"')).toBe(1);
    expect(count(h, 'aria-controls="panel-')).toBe(1); // only the open group has a panel to point at
    expect(count(h, 'role="region"')).toBe(1);
    expect(h).toContain("3. Power");
    expect(h).toContain("5. Engine and fuel");
    expect(h).toContain("kg fuel");
    expect(h).toContain("Go to launch calendar");
  });
});

describe("data", () => {
  it("every event id in events.json is known to the engine", () => {
    expect(events.map((e) => e.id).sort()).toEqual(EVENT_DEFS.map((e) => e.id).sort());
  });
});

describe("Stage 9 on screen", () => {
  it("the science gauge says an over-plan score as a win, not as 22 of 18", () => {
    expect(scienceValue(13, 18)).toBe("13 of 18 points");
    expect(scienceValue(18, 18)).toBe("18 of 18 points");
    expect(scienceValue(22, 18)).toBe("22 points · 4 more than planned");

    const sc = findScenario("moon");
    const check = runChecks(MOON_ALL, sc, 3, "slow");
    let s = createSimulation(MOON_ALL, sc, 3, "slow", check, 1, [{ day: 1, eventId: "bonusTarget" }, { day: 2, eventId: "extraData" }]);
    for (let i = 0; i < 200 && s.phase !== "orbit" && s.phase !== "failed"; i++) {
      s = s.pendingEvent ? resolveEvent(s, s.pendingEvent.id === "bonusTarget" ? "turn" : "send") : step(s, 0.5);
    }
    expect(s.scienceCollected).toBeGreaterThan(s.config.scienceTotal);
    const h = html(s);
    expect(h).toContain(`${s.scienceCollected} points · ${s.scienceCollected - s.config.scienceTotal} more than planned`);
    expect(h).not.toContain(`${s.scienceCollected} of ${s.config.scienceTotal} points`);
  });

  it("an opportunity card is green and says it is a chance, not a crisis", () => {
    const sc = findScenario("jupiter");
    const design: Design = { bodyId: "small", instrumentIds: ["camera", "magnetometer"], powerId: "solarLarge", antennaId: "antLarge", engineId: "chemical", rocketId: "medium", fuelKg: 3500 };
    const check = runChecks(design, sc, 4, "slow");
    const sim = step(createSimulation(design, sc, 4, "slow", check, 1, [{ day: 200, eventId: "gravityAssist" }]), 250);
    expect(sim.pendingEvent?.kind).toBe("opportunity");
    const h = html(sim);
    expect(h).toContain('class="modal card opportunity"');
    expect(h).toContain("★ Opportunity");
    expect(h).toContain("Paused: Free push from a planet. Take the chance, or stay on plan.");
    expect(h).toContain('class="status ok"'); // green, not the amber of a crisis
    expect(h).not.toContain("⚠ Challenge");
    // the three things the flyby really does are all on the card
    expect(h).toContain("Fuel saved: 60 kg");
    expect(h).toContain("+30 days");
    expect(h).toContain("1 in 10 chance of missing Jupiter");
    expect(h).toContain('class="affect gain">Fuel saved: 60 kg');
  });

  it("a problem card still says Challenge", () => {
    const h = html(withEvent("solarStorm"));
    expect(h).toContain("⚠ Challenge");
    expect(h).not.toContain("★ Opportunity");
    expect(h).not.toContain("modal card opportunity");
  });

  it("a follow-up card says which choice caused it", () => {
    const sc = findScenario("moon");
    const check = runChecks(MOON_ALL, sc, 3, "slow");
    let s = step(createSimulation(MOON_ALL, sc, 3, "slow", check, 1, [{ day: 1, eventId: "debris" }]), 2);
    expect(s.pendingEvent?.id).toBe("debris");
    s = resolveEvent(s, "hold");
    expect(s.upcoming.map((u) => u.eventId)).toEqual(["debrisDamage"]);
    for (let i = 0; i < 100 && !s.pendingEvent; i++) s = step(s, 0.1);
    expect(s.pendingEvent?.id).toBe("debrisDamage");
    const h = html(s);
    expect(h).toContain("This is because of your choice on day 1.");
  });

  it("the top bar carries the mission risk, and it climbs when a gamble is taken", () => {
    const calm = html(withEvent("solarStorm"));
    expect(calm).toContain("Mission risk: <b>Low</b>");
    expect(calm).toContain('class="risk low"');
    expect(calm).toContain("Every risky choice adds to this. It is the chance something goes wrong before you arrive.");

    const gambled = resolveEvent(withEvent("solarStorm"), "risky");
    const h = html(gambled);
    expect(h).toContain("Mission risk: <b>Medium</b>");
    expect(h).toContain('class="risk medium"');
  });

  it("results mark a chance that paid off with a plus and a green chip", () => {
    const sc = findScenario("moon");
    const check = runChecks(MOON_ALL, sc, 3, "slow");
    let s = createSimulation(MOON_ALL, sc, 3, "slow", check, 1, [{ day: 1, eventId: "bonusTarget" }]);
    for (let i = 0; i < 200 && s.phase !== "orbit" && s.phase !== "failed"; i++) {
      s = s.pendingEvent ? resolveEvent(s, "turn") : step(s, 0.5);
    }
    expect(s.decisions[0].gain).toBe(true);
    const summary = buildSummary(s, MOON_ALL, sc, 3, "slow", check);
    const h = renderToString(<ResultView summary={summary} director={{ text: explainMission(summary), source: "rules" }} onImprove={noop} onNew={noop} />);
    expect(h).toContain("➕");
    expect(h).toContain('<li class="won">');
    expect(h).toContain('<span class="affect gain">Science +15%</span>');
    expect(h).toContain("You took the chance on day 1 and it paid off");
  });
});
