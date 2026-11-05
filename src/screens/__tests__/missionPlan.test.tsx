// @vitest-environment jsdom
/**
 * Stage 17: the Mission plan screen. The player picks a goal and an orbit; the choice reaches the store,
 * the Design Lab, the simulation and the results.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { MissionPlan } from "../MissionPlan";
import { DesignLab } from "../DesignLab";
import { useGame } from "../../store/gameStore";
import { findScenario, runChecks } from "../../physics/checks";
import { insertionDeltaV, plansFor } from "../../physics/plan";
import { createSimulation } from "../../sim/simulation";
import { buildSummary } from "../../ai/flightDirector";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  useGame.getState().reset();
  useGame.getState().playSolo();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const radio = (name: string, labelText: string) =>
  [...host.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`)].find((i) => i.closest("label")!.textContent!.includes(labelText))!;

describe("Mission plan screen", () => {
  it("picking a mission opens the plan with the scenario's usual goal and orbit", () => {
    useGame.getState().pickScenario("mars");
    const s = useGame.getState();
    expect(s.screen).toBe("plan");
    expect(s.plan).toEqual({ objectiveId: "photos", orbitId: "oval" });
  });

  it("shows every goal and orbit with the braking burn, the loop time and the fit", () => {
    useGame.getState().pickScenario("mars");
    act(() => root.render(<MissionPlan />));
    const text = host.textContent!;
    for (const o of plansFor("mars").objectives) expect(text).toContain(o.name);
    for (const o of plansFor("mars").orbits) expect(text).toContain(o.name);
    expect(text).toContain(`${insertionDeltaV("mars", "low").toFixed(2)} km/s`);
    expect(text).toContain("One loop");
    expect(text).toContain("Great for this goal");
  });

  it("clicking a goal and an orbit updates the store and clears team sign-offs", () => {
    useGame.getState().pickScenario("mars");
    useGame.setState({ signoffs: ["p1"] });
    act(() => root.render(<MissionPlan />));
    act(() => radio("objective", "Look for buried water").click());
    act(() => radio("orbit", "Low circle").click());
    expect(useGame.getState().plan).toEqual({ objectiveId: "water", orbitId: "low" });
    expect(useGame.getState().signoffs).toEqual([]);
    // the orbit card now reads "Great" for the new goal
    expect(radio("orbit", "Low circle").closest("label")!.textContent).toContain("Great for this goal");
  });

  it("the Next button opens the Design Lab, which shows the plan and tags the goal's instruments", () => {
    useGame.getState().pickScenario("moon");
    useGame.getState().setObjective("ice");
    act(() => root.render(<MissionPlan />));
    const next = [...host.querySelectorAll("button")].find((b) => b.textContent!.includes("build the spacecraft"))!;
    act(() => next.click());
    expect(useGame.getState().screen).toBe("design");
    act(() => root.render(<DesignLab />));
    const instruments = [...host.querySelectorAll("button")].find((b) => b.textContent!.includes("2. Science instruments"))!;
    act(() => instruments.click());
    const text = host.textContent!;
    expect(text).toContain("Hunt for water ice");
    expect(text).toContain("Low circle");
    expect(text).toContain("⭐ Great for your goal");
    expect(text).toContain("Less useful for your goal");
  });
});

describe("the plan flies with the mission", () => {
  it("the simulation brakes by the chosen orbit's burn and the results name the plan", () => {
    const mars = findScenario("mars");
    const { launchMonth, route: _r, ...design } = mars.preset;
    const plan = { objectiveId: "water", orbitId: "low" };
    const check = runChecks(design, mars, launchMonth, "slow", plan);
    const sim = createSimulation(design, mars, launchMonth, "slow", check, 1, []);
    expect(sim.config.insertionDeltaV).toBeCloseTo(check.insertionDvKmS, 10);
    expect(sim.config.insertionDeltaV).toBeGreaterThan(mars.insertionDeltaV + 1);
    expect(sim.config.plan).toEqual(plan);
    const summary = buildSummary(sim, design, mars, launchMonth, "slow", check);
    expect(summary.plan?.goal).toBe("Look for buried water");
    expect(summary.plan?.orbit).toBe("Low circle");
  });

  it("the ready-made Mars design is not enough for a low circle: the bigger burn shows up as a failed fuel check", () => {
    const mars = findScenario("mars");
    const { launchMonth, route: _r, ...design } = mars.preset;
    expect(runChecks(design, mars, launchMonth, "slow").allOk).toBe(true);
    expect(runChecks(design, mars, launchMonth, "slow", { objectiveId: "photos", orbitId: "low" }).dv.ok).toBe(false);
  });
});
