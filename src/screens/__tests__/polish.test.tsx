/**
 * Stage 5 polish: the Home strip and tutorial button, the glossary, text marks next to colours,
 * the mute button default, and a sweep of every screen for React console warnings.
 */
import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { Home } from "../Home";
import { ChooseMission } from "../ChooseMission";
import { DesignLab } from "../DesignLab";
import { Launch } from "../Launch";
import { MissionControl, MissionView } from "../MissionControl";
import { Result, ResultView } from "../Result";
import { GlossaryPanel } from "../../components/Glossary";
import { ResourceBars } from "../../components/ResourceBars";
import { MuteButton } from "../../components/MuteButton";
import glossary from "../../data/glossary.json";
import { useGame } from "../../store/gameStore";
import { createSimulation, step } from "../../sim/simulation";
import { buildSummary, explainMission } from "../../ai/flightDirector";
import { runChecks, findScenario, type Design } from "../../physics/checks";

const noop = () => {};
const MOON_OK: Design = { bodyId: "small", instrumentIds: ["camera", "magnetometer"], powerId: "solarSmall", antennaId: "antSmall", engineId: "chemical", rocketId: "medium", fuelKg: 1400 };

describe("Home", () => {
  it("shows the three steps and the tutorial button", () => {
    const h = renderToString(<Home />);
    expect(h).toContain('aria-label="How to play"');
    for (const s of ["Pick a mission", "Build your spacecraft", "Launch and keep it alive"]) expect(h).toContain(s);
    expect(h).toContain("Try the tutorial (Moon)");
    expect(h).toContain("Start a mission");
  });

  it("the tutorial button pre-selects the Moon and opens the mission plan (goal + orbit) first", () => {
    useGame.getState().reset();
    useGame.getState().pickScenario("moon");
    expect(useGame.getState().scenarioId).toBe("moon");
    expect(useGame.getState().screen).toBe("plan");
  });
});

describe("Glossary", () => {
  it("lists the five required words, in a dialog", () => {
    const h = renderToString(<GlossaryPanel onClose={noop} />);
    for (const t of ["Delta-v (Δv)", "Isp", "Launch window", "AU", "RTG (nuclear battery)"]) expect(h).toContain(t);
    expect(glossary.length).toBeGreaterThanOrEqual(5);
    expect(h).toContain('role="dialog"');
    expect(h).toContain("Close the word list");
  });
});

describe("colour is never the only signal", () => {
  it("resource bars carry a mark and an aria-label", () => {
    const h = renderToString(<ResourceBars bars={[
      { label: "Mass (kg)", value: 2500, limit: 2000, ok: false },
      { label: "Budget ($M)", value: 100, limit: 250, ok: true },
    ]} />);
    expect(h).toContain("⚠ Mass (kg)");
    expect(h).toContain("✓ Budget ($M)");
    expect(h).toContain("over the limit");
    expect(h).toContain('role="group"');
  });

  it("the mute button starts off and says so", () => {
    useGame.getState().reset();
    const h = renderToString(<MuteButton />);
    expect(h).toContain("Sound off");
    expect(h).toContain('aria-pressed="false"');
  });
});

describe("no console warnings", () => {
  it("renders every screen without React warnings", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const warns = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      useGame.getState().reset();
      renderToString(<Home />);
      renderToString(<ChooseMission />);
      renderToString(<DesignLab />);
      renderToString(<Launch />);
      renderToString(<MissionControl />);
      renderToString(<Result />);
      renderToString(<GlossaryPanel onClose={noop} />);
      const sc = findScenario("moon");
      const check = runChecks(MOON_OK, sc, 3, "slow");
      const sim = step(createSimulation(MOON_OK, sc, 3, "slow", check, 1, [{ day: 1, eventId: "solarStorm" }]), 2);
      renderToString(<MissionView sim={sim} design={MOON_OK} speed={1} onSpeed={noop} fx={{ arrival: sim.pendingEvent?.id ?? null, flash: null, countdown: null, burning: false }} instruments={["Camera", "Magnetometer"]} clockOffset={0} clockFlash={false} shake={false} secondsLeft={10} contextOpen={true} onToggleContext={noop} openInfo={null} onOpenInfo={noop} spaceView={false} onToggleSpace={noop} onDecide={noop} onSeeResults={noop} />);
      const summary = buildSummary(sim, MOON_OK, sc, 3, "slow", check);
      renderToString(<ResultView summary={summary} director={{ text: explainMission(summary), source: "rules" }} onImprove={noop} onNew={noop} />);
      expect(errors.mock.calls.map((c) => c.map(String).join(" "))).toEqual([]);
      expect(warns.mock.calls.map((c) => c.map(String).join(" "))).toEqual([]);
    } finally {
      errors.mockRestore();
      warns.mockRestore();
    }
  });
});
