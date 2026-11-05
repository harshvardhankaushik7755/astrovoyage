/**
 * The mission plan (Stage 17): what the mission is for (the objective) and which orbit it goes into.
 * The objective decides which instruments earn the most science; the orbit decides the braking burn
 * (real physics, see orbits.ts) and how well it suits the objective. All numbers come from plans.json.
 */
import plans from "../data/plans.json";
import { captureDeltaV, formatPeriod, orbitPeriodHours, type OrbitShape, type PlanetBody } from "./orbits";

export interface Plan { objectiveId: string; orbitId: string }

export interface Objective {
  id: string; icon: string; name: string; short: string;
  /** science multiplier per instrument id; an instrument left out counts 1 */
  instruments: Record<string, number>;
  /** the instruments shown as "best tools" */
  key: string[];
  /** science multiplier per orbit id */
  orbitFit: Record<string, number>;
}
export interface OrbitOption extends OrbitShape { id: string; icon: string; name: string; size: string; short: string; like: string }
interface ScenarioPlans { body: PlanetBody; defaultOrbit: string; orbits: OrbitOption[]; objectives: Objective[] }

export const PLAN_TEXT = plans.text;

export function plansFor(scenarioId: string): ScenarioPlans {
  const p = (plans.byScenario as unknown as Record<string, ScenarioPlans>)[scenarioId];
  if (!p) throw new Error(`No mission plans for scenario "${scenarioId}"`);
  return p;
}

/** The first objective and the scenario's usual orbit: the plan every scenario was balanced on. */
export function defaultPlan(scenarioId: string): Plan {
  const p = plansFor(scenarioId);
  return { objectiveId: p.objectives[0].id, orbitId: p.defaultOrbit };
}

export function findObjective(scenarioId: string, id: string): Objective {
  const p = plansFor(scenarioId);
  return p.objectives.find((o) => o.id === id) ?? p.objectives[0];
}

export function findOrbit(scenarioId: string, id: string): OrbitOption {
  const p = plansFor(scenarioId);
  return p.orbits.find((o) => o.id === id) ?? p.orbits.find((o) => o.id === p.defaultOrbit)!;
}

/** Science multiplier for one instrument under this objective (1 when the objective does not mention it). */
export function instrumentWeight(objective: Objective, instrumentId: string): number {
  return objective.instruments[instrumentId] ?? 1;
}

/** Science multiplier for flying this objective from this orbit. */
export function orbitFit(objective: Objective, orbitId: string): number {
  return objective.orbitFit[orbitId] ?? 1;
}

export type FitLevel = "great" | "good" | "ok" | "poor";
export function fitLevel(fit: number): FitLevel {
  if (fit >= plans.fit.great) return "great";
  if (fit >= plans.fit.good) return "good";
  if (fit >= plans.fit.ok) return "ok";
  return "poor";
}
export const fitWord = (fit: number) => plans.fit.words[fitLevel(fit)];

/** Braking burn (km/s) to get into this orbit at the target. */
export function insertionDeltaV(scenarioId: string, orbitId: string): number {
  return captureDeltaV(plansFor(scenarioId).body, findOrbit(scenarioId, orbitId));
}

/** "3 hours", "53 days": how long one trip round this orbit takes. */
export function orbitLoop(scenarioId: string, orbitId: string): string {
  return formatPeriod(orbitPeriodHours(plansFor(scenarioId).body, findOrbit(scenarioId, orbitId)));
}

/** Science points (before the data-home fraction) for these instruments under this plan. */
export function planScience(scenarioId: string, plan: Plan, instruments: { id: string; science: number }[]): number {
  const objective = findObjective(scenarioId, plan.objectiveId);
  const fit = orbitFit(objective, plan.orbitId);
  return instruments.reduce((sum, i) => sum + i.science * instrumentWeight(objective, i.id), 0) * fit;
}

/** "⭐ Great for your goal" / "Less useful for your goal" / null for an instrument under this objective. */
export function instrumentTag(objective: Objective, instrumentId: string): { tone: "good" | "bad"; text: string } | null {
  const w = instrumentWeight(objective, instrumentId);
  if (w > 1) return { tone: "good", text: plans.instrumentWords.boost };
  if (w < 1) return { tone: "bad", text: plans.instrumentWords.weak };
  return objective.key.includes(instrumentId) ? { tone: "good", text: plans.instrumentWords.boost } : null;
}
