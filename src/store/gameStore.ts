/**
 * One place that holds every choice the player makes, plus the mission in flight.
 * Screens read from here and write to here. Nothing else keeps state.
 */
import { create } from "zustand";
import { runChecks, findScenario, type Design } from "../physics/checks";
import type { Route } from "../physics/windows";
import { createSimulation, resolveEvent, step, type SimState } from "../sim/simulation";
import { demoSchedule, DEMO_SCENARIO } from "../sim/demo";
import { assignRoles, type Player } from "../sim/team";
import { defaultPlan, type Plan } from "../physics/plan";

export type Screen = "home" | "team" | "choose" | "plan" | "design" | "launch" | "mission" | "result";

interface GameState {
  screen: Screen;
  scenarioId: string;
  design: Design;
  launchMonth: number;
  route: Route;
  /** Stage 17: what the mission is for and which orbit it goes into at the target. */
  plan: Plan;
  /** The mission in flight, or the one just flown. null until the player presses Launch. */
  sim: SimState | null;
  go: (screen: Screen) => void;
  pickScenario: (id: string) => void;
  setPart: <K extends keyof Design>(key: K, value: Design[K]) => void;
  toggleInstrument: (id: string) => void;
  setLaunchMonth: (m: number) => void;
  setRoute: (r: Route) => void;
  setObjective: (id: string) => void;
  setOrbit: (id: string) => void;
  /** Fill in the ready-made design, launch month and route for the current scenario (from scenarios.json). */
  loadPreset: () => void;
  /** Launch: build the simulation from the current design and open Mission Control. demo = fire every challenge early. */
  startMission: (demo?: boolean) => void;
  /** ?demo=1: jump straight into the demo mission, design and all. */
  startDemo: () => void;
  /** Move the mission forward by some days. Mission Control calls this every animation frame. */
  tick: (days: number) => void;
  /** Answer the challenge that is waiting. auto = mission control chose because the countdown ran out. */
  decide: (optionId: string, auto?: boolean) => void;
  /** Sound is off by default; the mute button flips it. */
  muted: boolean;
  toggleMute: () => void;
  /** Stage 12: the short beat before a challenge card. On by default, off for good once turned off. */
  skipAnimations: boolean;
  toggleSkipAnimations: () => void;
  /** Team mode: the players and their roles, or null when one person plays alone. */
  team: Player[] | null;
  /** Ids of the players who have said "I agree" to the current plan. Any change to the plan clears it. */
  signoffs: string[];
  /** Start team mode with these names (2–4) and go on to choose a mission. */
  startTeam: (names: string[]) => void;
  playSolo: () => void;
  toggleSignoff: (playerId: string) => void;
  reset: () => void;
}

const defaultDesign: Design = {
  bodyId: "small",
  instrumentIds: ["camera"],
  powerId: "solarSmall",
  antennaId: "antSmall",
  engineId: "chemical",
  rocketId: "light",
  fuelKg: 500,
};

export const useGame = create<GameState>((set) => ({
  screen: "home",
  scenarioId: "moon",
  design: { ...defaultDesign },
  launchMonth: 0,
  route: "slow",
  plan: defaultPlan("moon"),
  sim: null,
  muted: true,
  skipAnimations: false,
  team: null,
  signoffs: [],
  go: (screen) => set({ screen }),
  pickScenario: (scenarioId) =>
    set({ scenarioId, design: { ...defaultDesign }, launchMonth: 0, route: "slow", plan: defaultPlan(scenarioId), sim: null, screen: "plan", signoffs: [] }),
  setPart: (key, value) => set((s) => ({ design: { ...s.design, [key]: value }, signoffs: [] })),
  toggleInstrument: (id) =>
    set((s) => {
      const has = s.design.instrumentIds.includes(id);
      const instrumentIds = has ? s.design.instrumentIds.filter((x) => x !== id) : [...s.design.instrumentIds, id];
      return { design: { ...s.design, instrumentIds }, signoffs: [] };
    }),
  setLaunchMonth: (launchMonth) => set({ launchMonth, signoffs: [] }),
  setRoute: (route) => set({ route, signoffs: [] }),
  setObjective: (objectiveId) => set((s) => ({ plan: { ...s.plan, objectiveId }, signoffs: [] })),
  setOrbit: (orbitId) => set((s) => ({ plan: { ...s.plan, orbitId }, signoffs: [] })),
  loadPreset: () =>
    set((s) => {
      const { launchMonth, route, ...design } = findScenario(s.scenarioId).preset;
      return { design, launchMonth, route: route === "fast" ? "fast" : "slow", sim: null, signoffs: [] };
    }),
  startDemo: () =>
    set(() => {
      // one click from the home screen into a flying mission: the demo scenario, its ready-made design
      const scenario = findScenario(DEMO_SCENARIO);
      const { launchMonth, route, ...design } = scenario.preset;
      const theRoute: Route = route === "fast" ? "fast" : "slow";
      const plan = defaultPlan(scenario.id);
      const check = runChecks(design, scenario, launchMonth, theRoute, plan);
      const sim = createSimulation(design, scenario, launchMonth, theRoute, check, undefined, demoSchedule(Math.max(1, check.tripDays)));
      return { scenarioId: scenario.id, design, launchMonth, route: theRoute, plan, sim, screen: "mission" };
    }),
  startMission: (demo = false) =>
    set((s) => {
      const scenario = findScenario(s.scenarioId);
      const check = runChecks(s.design, scenario, s.launchMonth, s.route, s.plan);
      const schedule = demo ? demoSchedule(Math.max(1, check.tripDays)) : undefined;
      return { sim: createSimulation(s.design, scenario, s.launchMonth, s.route, check, undefined, schedule), screen: "mission" };
    }),
  tick: (days) => set((s) => (s.sim ? { sim: step(s.sim, days) } : {})),
  decide: (optionId, auto = false) => set((s) => (s.sim ? { sim: resolveEvent(s.sim, optionId, auto) } : {})),
  toggleMute: () => set((s) => ({ muted: !s.muted })),
  toggleSkipAnimations: () => set((s) => ({ skipAnimations: !s.skipAnimations })),
  startTeam: (names) => set({ team: assignRoles(names), signoffs: [], screen: "choose" }),
  playSolo: () => set({ team: null, signoffs: [] }),
  toggleSignoff: (id) =>
    set((s) => ({ signoffs: s.signoffs.includes(id) ? s.signoffs.filter((x) => x !== id) : [...s.signoffs, id] })),
  // the team stays together for the next mission; "Play alone" on the home screen breaks it up
  reset: () => set({ screen: "home", design: { ...defaultDesign }, launchMonth: 0, route: "slow", sim: null, signoffs: [] }),
}));
