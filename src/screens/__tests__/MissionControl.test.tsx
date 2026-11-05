/**
 * Mission Control without a browser: the store actions that Launch!, the animation loop and the
 * challenge card call, and MissionView rendered to HTML with react-dom/server.
 */
import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { useGame } from "../../store/gameStore";
import { MissionView, type Speed } from "../MissionControl";
import { runChecks, findScenario, type Design } from "../../physics/checks";
import { createSimulation, step, resolveEvent, safestOption, EVENT_DEFS, type ScheduledEvent, type SimState } from "../../sim/simulation";
import scenarios from "../../data/scenarios.json";
import settings from "../../data/settings.json";
import { demoSchedule, demoContents, DEMO_EVENTS, DEMO_SCENARIO } from "../../sim/demo";

const MOON_OK: Design = {
  bodyId: "small", instrumentIds: ["camera", "magnetometer"], powerId: "solarSmall",
  antennaId: "antSmall", engineId: "chemical", rocketId: "medium", fuelKg: 1400,
};
/** Cheapest Mars design that passes every check; almost no fuel to spare. */
const MARS_TIGHT: Design = { bodyId: "small", instrumentIds: ["camera"], powerId: "solarSmall", antennaId: "antLarge", engineId: "chemical", rocketId: "light", fuelKg: 1550 };
const noop = () => {};

/**
 * Do what the player does (pick a scenario, set a design, press Launch!), then swap in a
 * repeatable mission: seed 1 and the given challenges (none by default).
 */
function launch(scenarioId: string, design: Design = MOON_OK, launchMonth = 3, schedule: ScheduledEvent[] = []): SimState {
  const g = useGame.getState();
  g.reset();
  g.pickScenario(scenarioId);
  useGame.setState({ design, launchMonth, route: "slow" });
  g.startMission();
  const sc = findScenario(scenarioId);
  useGame.setState({ sim: createSimulation(design, sc, launchMonth, "slow", runChecks(design, sc, launchMonth, "slow"), 1, schedule) });
  return useGame.getState().sim!;
}

function html(sim: SimState, speed: Speed = 1, burning = false, secondsLeft: number | null = null): string {
  return renderToString(
    <MissionView sim={sim} design={MOON_OK} speed={speed} onSpeed={noop} fx={{ arrival: sim.pendingEvent?.id ?? null, flash: null, countdown: null, burning }} instruments={["Camera", "Magnetometer"]} clockOffset={0} clockFlash={false} shake={false} secondsLeft={secondsLeft} contextOpen={true} onToggleContext={noop} openInfo={null} onOpenInfo={noop} spaceView={false} onToggleSpace={noop} onDecide={noop} onSeeResults={noop} />,
  );
}

const count = (s: string, needle: string) => s.split(needle).length - 1;

describe("store: Launch! and the animation loop", () => {
  it("Launch! builds the mission with challenges and opens Mission Control", () => {
    const g = useGame.getState();
    g.reset();
    g.pickScenario("moon");
    useGame.setState({ design: MOON_OK, launchMonth: 3, route: "slow" });
    g.startMission();
    const { screen, sim } = useGame.getState();
    expect(screen).toBe("mission");
    expect(sim?.phase).toBe("cruise");
    expect(sim?.missionDay).toBe(0);
    expect(sim?.totalDays).toBe(4);
    expect(sim?.upcoming.length).toBeGreaterThanOrEqual(settings.eventsPerMission.min);
    expect(sim?.upcoming.length).toBeLessThanOrEqual(settings.eventsPerMission.max);
  });

  it("tick moves the clock, and stops changing state once the mission is over", () => {
    launch("moon");
    const { tick } = useGame.getState();
    tick(1);
    expect(useGame.getState().sim?.missionDay).toBe(1);
    tick(100);
    expect(useGame.getState().sim?.phase).toBe("insertion");
    tick(0);
    const done = useGame.getState().sim;
    expect(done?.phase).toBe("orbit");
    tick(5);
    expect(useGame.getState().sim).toBe(done);
  });

  it("picking a new scenario clears the old mission", () => {
    launch("moon");
    useGame.getState().pickScenario("mars");
    expect(useGame.getState().sim).toBeNull();
  });
});

describe("MissionView", () => {
  it("shows the clock, the status, all six gauges and the log", () => {
    const h = html(launch("moon"));
    expect(h).toContain("Day 0 of 4");
    expect(h).toContain("1 sec = 90 minutes");
    expect(h).toContain("Cruising to the Moon.");
    for (const label of ["Fuel", "Power", "Signal strength", "Signal delay", "Distance from Earth", "Science collected"]) {
      expect(h).toContain(label);
    }
    expect(h).toContain("1,400 kg left");
    expect(h).toContain("600 W made");
    expect(h).toContain("Earth hears you after");
    expect(h).toContain("Mission log");
    expect(h).toContain("gravity");
    expect(h).not.toContain("See results");
    expect(h).not.toContain('role="dialog"');
  });

  it("Moon map has Earth in the centre; Mars map has the Sun, Earth and Mars", () => {
    const moon = html(launch("moon"));
    expect(moon).toContain(">Earth<");
    expect(moon).toContain(">Moon<");
    expect(moon).not.toContain(">Sun<");
    expect(count(moon, 'class="orbit"')).toBe(1);

    const mars = html(launch("mars", { ...MOON_OK, instrumentIds: ["camera"], antennaId: "antLarge", fuelKg: 2600 }, 10));
    expect(mars).toContain(">Sun<");
    expect(mars).toContain(">Earth<");
    expect(mars).toContain(">Mars<");
    expect(count(mars, 'class="orbit"')).toBe(2);
    expect(mars).toContain("1 sec = 5 days");
  });

  it("shows pause, the insertion burn, and the captured orbit with a See results button", () => {
    const sim = launch("moon");
    expect(html(sim, 0)).toContain("Paused on the way to the Moon.");

    const { tick } = useGame.getState();
    tick(100);
    const burn = html(useGame.getState().sim!, 1, true);
    expect(burn).toContain("Orbit insertion burn");
    expect(burn).toContain('class="glow"');

    tick(0);
    const end = html(useGame.getState().sim!);
    expect(end).toContain("Orbit captured!");
    expect(end).toContain("See results");
    expect(end).toContain('class="status ok"');
    expect(end).toContain("18 of 18 points");
  });

  it("shows a fly-by in red", () => {
    launch("moon", { ...MOON_OK, fuelKg: 700 });
    const { tick } = useGame.getState();
    tick(100);
    tick(0);
    const end = html(useGame.getState().sim!);
    expect(useGame.getState().sim?.phase).toBe("failed");
    expect(end).toContain('class="status bad"');
    expect(end).toContain("flew past the planet");
    expect(end).toContain("See results");
  });
});

describe("challenge card", () => {
  it("shows the event, its options and the countdown, then hides it after the decision", () => {
    launch("moon", MOON_OK, 3, [{ day: 1, eventId: "solarStorm" }]);
    const { tick, decide } = useGame.getState();
    tick(2);
    const sim = useGame.getState().sim!;
    expect(sim.pendingEvent?.id).toBe("solarStorm");
    expect(sim.missionDay).toBe(1);

    const h = html(sim);
    expect(h).toContain('role="dialog"');
    expect(h).toContain("Solar storm");
    expect(h).toContain("burst of charged particles");
    expect(h).toContain("Switch the instruments off until it passes");
    expect(h).toContain("Keep working");
    expect(h).toContain("Decide in 20 s");
    expect(h).toContain("Paused: Solar storm. Decide what to do.");
    expect(html(sim, 1, false, 7)).toContain("Decide in 7 s");

    decide("safe");
    const after = html(useGame.getState().sim!);
    expect(after).not.toContain('role="dialog"');
    expect(after).toContain("You chose: Switch the instruments off");
    tick(1);
    expect(useGame.getState().sim?.missionDay).toBe(2);
  });

  it("a decision by mission control is logged as such", () => {
    launch("moon", MOON_OK, 3, [{ day: 1, eventId: "courseDrift" }]);
    const { tick, decide } = useGame.getState();
    tick(2);
    const ev = useGame.getState().sim!.pendingEvent!;
    decide(safestOption(ev).id, true);
    expect(html(useGame.getState().sim!)).toContain("Mission control chose for you");
  });

  it("warns on an option the tank cannot afford", () => {
    launch("mars", MARS_TIGHT, 10, [{ day: 50, eventId: "courseDrift" }]);
    useGame.getState().tick(60);
    expect(html(useGame.getState().sim!)).toContain("not be enough fuel left to slow down at Mars");
  });
});

describe("ready-made designs (Load a design that works)", () => {
  it("pass every check and reach orbit for each scenario (without challenges)", () => {
    for (const sc of scenarios) {
      const g = useGame.getState();
      g.reset();
      g.pickScenario(sc.id);
      g.loadPreset();
      const { design, launchMonth, route } = useGame.getState();
      const check = runChecks(design, sc, launchMonth, route);
      expect(check.problems, sc.id).toEqual([]);
      let s = createSimulation(design, sc, launchMonth, route, check, 1, []);
      for (let i = 0; i < 5 && s.phase !== "orbit"; i++) s = step(s, 1e9);
      expect(s.phase, sc.id).toBe("orbit");
    }
  });
});

describe("demo mode", () => {
  it("startMission(true) schedules all five cards in the first part of the trip", () => {
    const g = useGame.getState();
    g.reset();
    g.pickScenario("moon");
    g.loadPreset();
    g.startMission(true);
    const sim = useGame.getState().sim!;
    expect(sim.upcoming).toEqual(demoSchedule(sim.totalDays));
    expect(sim.upcoming.map((u) => u.eventId)).toEqual(["debris", "bonusTarget", "extraData", "sunPush", "safeMode"]);
    expect(sim.upcoming[4].day).toBeLessThan(sim.totalDays * 0.4);
  });

  it("the demo shows off the new work: a chance to take, and an event caused by taking it", () => {
    const { opportunities, followUps } = demoContents();
    expect(opportunities.length).toBeGreaterThanOrEqual(1);
    expect(followUps.length).toBeGreaterThanOrEqual(1);
    // the follow-up comes after the choice that causes it, and that choice is in the demo too
    const causes = followUps.map((id) => EVENT_DEFS.find((e) => e.id === id)!.follows!);
    for (const c of causes) {
      expect(DEMO_EVENTS).toContain(c.eventId);
      expect(DEMO_EVENTS.indexOf(c.eventId)).toBeLessThan(DEMO_EVENTS.findIndex((id) => EVENT_DEFS.find((e) => e.id === id)?.follows));
    }
  });

  it("one click from ?demo=1 lands in a flying Mars mission with the ready-made design", () => {
    const g = useGame.getState();
    g.reset();
    expect(useGame.getState().screen).toBe("home");
    useGame.getState().startDemo();
    const { screen, scenarioId, sim, design } = useGame.getState();
    expect(screen).toBe("mission");
    expect(scenarioId).toBe(DEMO_SCENARIO);
    expect(scenarioId).toBe("mars");
    expect(sim?.phase).toBe("cruise");
    expect(sim?.upcoming.map((u) => u.eventId)).toEqual(DEMO_EVENTS);
    // the ready-made design passes every check, so the demo can never open on a broken mission
    const sc = findScenario("mars");
    expect(runChecks(design, sc, useGame.getState().launchMonth, useGame.getState().route).problems).toEqual([]);
  });

  it("no two demo cards arrive on top of each other, even after the days a choice costs", () => {
    useGame.getState().reset();
    useGame.getState().startDemo();
    let sim = useGame.getState().sim!;
    const gap = sim.totalDays * 0.05;
    const seen: string[] = [];
    let clock = 0;
    for (let i = 0; i < 20_000 && seen.length < DEMO_EVENTS.length; i++) {
      if (sim.pendingEvent) {
        const card = sim.pendingEvent;
        // the first card is meant to come early; every later one must leave the player room to breathe
        if (seen.length > 0) {
          expect(card.day - clock, `${card.id} came only ${(card.day - clock).toFixed(1)} days after the one before`).toBeGreaterThanOrEqual(gap);
        }
        seen.push(card.id);
        // the first option is the interesting one, and on two cards it costs days
        sim = resolveEvent(sim, card.options[0].id);
        clock = sim.missionDay; // where the clock stands after any days lost
      } else sim = step(sim, sim.totalDays / 400);
    }
    expect(seen).toEqual(DEMO_EVENTS);
    expect(sim.phase).toBe("cruise"); // and all five are done with the trip still going
  });

  it("taking the chance really causes the follow-up, and the card names the day of that choice", () => {
    const g = useGame.getState();
    g.reset();
    g.pickScenario("moon");
    g.loadPreset();
    g.startMission(true);
    let sim = useGame.getState().sim!;
    for (let i = 0; i < 200 && sim.pendingEvent?.id !== "bonusTarget"; i++) {
      sim = sim.pendingEvent ? resolveEvent(sim, safestOption(sim.pendingEvent).id) : step(sim, 0.05);
    }
    expect(sim.pendingEvent?.id).toBe("bonusTarget");
    expect(sim.pendingEvent?.kind).toBe("opportunity");
    const chosenOn = sim.pendingEvent!.day;

    sim = resolveEvent(sim, "turn"); // take the photograph
    expect(sim.decisions[sim.decisions.length - 1].gain).toBe(true);
    const followUp = sim.upcoming.find((u) => u.eventId === "extraData")!;
    expect(followUp.causedOnDay).toBe(chosenOn); // the day of the decision, not the day the clock jumped to

    for (let i = 0; i < 200 && sim.pendingEvent?.id !== "extraData"; i++) {
      sim = sim.pendingEvent ? resolveEvent(sim, safestOption(sim.pendingEvent).id) : step(sim, 0.05);
    }
    expect(sim.pendingEvent?.causedOnDay).toBe(chosenOn);
    expect(html(sim)).toContain(`This is because of your choice on day ${chosenOn}.`);
  });
});
