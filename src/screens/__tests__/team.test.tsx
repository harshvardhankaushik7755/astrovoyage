// @vitest-environment jsdom
/**
 * Stage 13: team mode on screen. The setup shows who does what, the challenge card names whose call
 * it is, and the results show every player's goal and the team score. Solo play shows none of it.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderToString } from "react-dom/server";
import { createRoot, type Root } from "react-dom/client";
import { act, type ReactElement } from "react";
import team from "../../data/team.json";
import { TeamSetup } from "../TeamSetup";
import { Launch } from "../Launch";
import { DesignLab } from "../DesignLab";
import { MissionView } from "../MissionControl";
import { ResultView, type TeamReport } from "../Result";
import { useGame } from "../../store/gameStore";
import { buildSummary, explainMission } from "../../ai/flightDirector";
import { createSimulation, step, type SimState } from "../../sim/simulation";
import { assignRoles, evaluateGoals, teamBonus } from "../../sim/team";
import { runChecks, findScenario, type Design } from "../../physics/checks";

const noop = () => {};
const MOON: Design = { bodyId: "small", instrumentIds: ["camera", "magnetometer"], powerId: "solarSmall", antennaId: "antSmall", engineId: "chemical", rocketId: "medium", fuelKg: 1400 };
const PLAYERS = assignRoles(["Asha", "Ben", "Chen", "Dev"]);
const decode = (html: string) => html.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");

function atChallenge(eventId: string): SimState {
  const sc = findScenario("moon");
  const s = step(createSimulation(MOON, sc, 3, "slow", runChecks(MOON, sc, 3, "slow"), 1, [{ day: 1, eventId }]), 2);
  expect(s.pendingEvent?.id).toBe(eventId);
  return s;
}
const card = (sim: SimState, players = PLAYERS as typeof PLAYERS | null) => decode(renderToString(
  <MissionView sim={sim} design={MOON} speed={1} onSpeed={noop} fx={{ arrival: sim.pendingEvent?.id ?? null, flash: null, countdown: null, burning: false }}
    instruments={["Camera", "Magnetometer"]} clockOffset={0} clockFlash={false} shake={false} secondsLeft={12}
    contextOpen={false} onToggleContext={noop} openInfo={null} onOpenInfo={noop} spaceView={false} onToggleSpace={noop}
    team={players} onDecide={noop} onSeeResults={noop} />,
));

// screens that read the store are mounted for real: renderToString only ever sees the store's first state
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
function mount(el: ReactElement): string {
  const host = document.createElement("div");
  document.body.appendChild(host);
  act(() => { root = createRoot(host); root.render(el); });
  return host.innerHTML;
}
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ""; });

beforeEach(() => {
  useGame.getState().reset();
  useGame.getState().playSolo();
});

describe("team setup", () => {
  it("starts with two players and shows every role's job", () => {
    const html = decode(mount(<TeamSetup />));
    expect(html).toContain(team.text.setupTitle);
    expect(html.match(/class="name-input"/g)).toHaveLength(2);
    for (const r of team.roles) expect(html).toContain(r.name);
  });
});

describe("challenge card", () => {
  it("names the player whose part it is: course drift is the Engineer's call", () => {
    const html = card(atChallenge("courseDrift"));
    expect(html).toContain("Ben's call · Spacecraft Engineer");
  });

  it("solo play shows no caller", () => {
    expect(card(atChallenge("courseDrift"), null)).not.toContain('class="caller"');
  });
});

describe("design lab and launch", () => {
  it("each part group carries its owner and the aside lists the team goals", () => {
    const g = useGame.getState;
    g().startTeam(["Asha", "Ben", "Chen", "Dev"]);
    g().pickScenario("moon");
    const html = decode(mount(<DesignLab />));
    expect(html.match(/class="owner-badge"/g)!.length).toBeGreaterThanOrEqual(6);
    expect(html).toContain(team.text.panelTitle);
  });

  it("the Launch button stays locked until every player has said go", () => {
    const g = useGame.getState;
    g().startTeam(["Asha", "Ben"]);
    g().pickScenario("moon");
    g().loadPreset();
    const locked = decode(mount(<Launch />));
    expect(locked).toContain("Waiting for: Asha, Ben");
    expect(locked).toMatch(/<button[^>]*disabled=""[^>]*>Launch! 🚀/);
    act(() => { g().toggleSignoff("p1"); g().toggleSignoff("p2"); });
    const open = decode(mount(<Launch />));
    expect(open).not.toContain("Waiting for");
    expect(open).not.toMatch(/<button[^>]*disabled=""[^>]*>Launch! 🚀/);
  });

  it("solo launch has no sign-off", () => {
    useGame.getState().pickScenario("moon");
    useGame.getState().loadPreset();
    expect(decode(mount(<Launch />))).not.toContain(team.text.signoffTitle);
  });
});

describe("results", () => {
  const sc = findScenario("moon");
  const check = runChecks(MOON, sc, 3, "slow");
  const summary = buildSummary(null, MOON, sc, 3, "slow", check);
  const director = { text: explainMission(summary), source: "rules" as const };

  it("shows the team score and every player's goal", () => {
    const goals = evaluateGoals(PLAYERS, "moon", check, summary.score.science);
    const report: TeamReport = { goals, ...teamBonus(goals) };
    const html = decode(renderToString(<ResultView summary={summary} director={director} team={report} onImprove={noop} onNew={noop} />));
    expect(html).toContain(team.text.resultTitle);
    expect(html).toContain(`Team score ${summary.score.score + report.bonus}: mission score ${summary.score.score} + ${report.bonus} for team goals`);
    for (const name of ["Asha", "Ben", "Chen", "Dev"]) expect(html).toContain(name);
  });

  it("celebrates when every goal is met", () => {
    const goals = evaluateGoals(PLAYERS, "moon", check).map((g) => ({ ...g, met: true }));
    const html = decode(renderToString(<ResultView summary={summary} director={director} team={{ goals, ...teamBonus(goals) }} onImprove={noop} onNew={noop} />));
    expect(html).toContain(`Every team goal met! +${team.scoring.allGoalsBonus} bonus`);
  });

  it("solo results have no team section", () => {
    const html = renderToString(<ResultView summary={summary} director={director} onImprove={noop} onNew={noop} />);
    expect(html).not.toContain(team.text.resultTitle);
  });
});
