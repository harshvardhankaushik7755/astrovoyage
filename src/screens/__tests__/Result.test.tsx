/**
 * The results screen rendered to HTML with react-dom/server, from a real flown mission.
 */
import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { ResultView } from "../Result";
import { buildSummary, explainMission, type MissionSummary } from "../../ai/flightDirector";
import { createSimulation, step, resolveEvent, type ScheduledEvent } from "../../sim/simulation";
import { runChecks, findScenario, type Design } from "../../physics/checks";

const MOON_OK: Design = { bodyId: "small", instrumentIds: ["camera", "magnetometer"], powerId: "solarSmall", antennaId: "antSmall", engineId: "chemical", rocketId: "medium", fuelKg: 1400 };
const noop = () => {};

function flownSummary(design: Design, schedule: ScheduledEvent[] = [], choose: Record<string, string> = {}): MissionSummary {
  const sc = findScenario("moon");
  const check = runChecks(design, sc, 3, "slow");
  let s = createSimulation(design, sc, 3, "slow", check, 1, schedule);
  for (let i = 0; i < 10_000 && s.phase !== "orbit" && s.phase !== "failed"; i++) {
    s = s.pendingEvent ? resolveEvent(s, choose[s.pendingEvent.id] ?? s.pendingEvent.options[0].id) : step(s, 1);
  }
  return buildSummary(s, design, sc, 3, "slow", check);
}
const count = (s: string, needle: string) => s.split(needle).length - 1;

describe("ResultView", () => {
  it("shows stars, the score line, the Flight Director, the decisions with ✅/⚠️ and the real missions", () => {
    const summary = flownSummary(MOON_OK, [{ day: 1, eventId: "solarStorm" }, { day: 2, eventId: "courseDrift" }], { solarStorm: "safe", courseDrift: "correct" });
    const html = renderToString(<ResultView summary={summary} director={{ text: explainMission(summary), source: "rules" }} onImprove={noop} onNew={noop} />);
    expect(html).toContain("Mission reached the Moon!");
    expect(html).toContain("⭐ Reached the target");
    expect(html).toContain("☆ Full success");
    expect(html).toContain("⭐ Under budget");
    expect(html).toContain("Score 119: 16 science × 100% success + $103M saved");
    expect(html).toContain("Flight Director");
    expect(html).toContain("mission rules");
    expect(html).toContain('class="avatar"');
    expect(html).toContain("price of safety");
    expect(html).toContain("What happened on the way");
    expect(html).toContain("⚠️");
    expect(html).toContain("✅");
    expect(html).toContain("Day 1: Solar storm");
    expect(html).toContain("Day 2: Course drift");
    expect(html).toContain("Chandrayaan-2 Orbiter");
    expect(html).toContain("Lunar Reconnaissance Orbiter");
    expect(html).toContain("like Chandrayaan-2 Orbiter");
  });

  it("shows a failed flight with no stars, and the waiting state while the AI answers", () => {
    const summary = flownSummary({ ...MOON_OK, fuelKg: 700 });
    expect(summary.flight.outcome).toBe("failed");
    const html = renderToString(<ResultView summary={summary} director={{ text: "", source: "waiting" }} onImprove={noop} onNew={noop} />);
    expect(html).toContain("Mission to the Moon failed");
    expect(count(html, "☆")).toBe(2);
    expect(html).toContain("⭐ Under budget");
    expect(html).toContain("The Flight Director is thinking");
    expect(html).not.toContain("What happened on the way");
  });

  it("labels an AI explanation as such", () => {
    const summary = flownSummary(MOON_OK);
    const html = renderToString(<ResultView summary={summary} director={{ text: "Great flight, commander.", source: "ai" }} onImprove={noop} onNew={noop} />);
    expect(html).toContain("Great flight, commander.");
    expect(html).toContain("· AI");
  });
});

describe("cause and effect on the results list", () => {
  it("shows the event icon and the delta each decision caused", () => {
    const summary = flownSummary(MOON_OK, [{ day: 1, eventId: "solarStorm" }, { day: 2, eventId: "courseDrift" }], { solarStorm: "safe", courseDrift: "correct" });
    const html = renderToString(<ResultView summary={summary} director={{ text: "", source: "rules" }} onImprove={noop} onNew={noop} />);
    expect(html).toContain("🌞 Day 1: Solar storm");
    expect(html).toContain("Science −10%");
    expect(html).toContain("🧭 Day 2: Course drift");
    expect(html).toContain("Fuel −8 kg");
  });
});
