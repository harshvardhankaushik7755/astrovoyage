/**
 * Runs all four launch checks on a design (GDD Section 6).
 * Pure function: same input → same output. No React here, so it is easy to test.
 */
import parts from "../data/parts.json";
import scenarios from "../data/scenarios.json";
import { deltaV } from "./rocketEquation";
import { powerMade } from "./power";
import { dataReturnedFraction } from "./comms";
import { checkWindow, ROUTE, type Route } from "./windows";
import { defaultPlan, insertionDeltaV, planScience, type Plan } from "./plan";

export type Scenario = (typeof scenarios)[number];

export interface Design {
  bodyId: string;
  instrumentIds: string[];
  powerId: string;
  antennaId: string;
  engineId: string;
  rocketId: string;
  fuelKg: number;
}

export interface Bar {
  value: number; limit: number; ok: boolean; label: string;
  /** The two numbers in words, for a player who has never seen this bar before. */
  hint?: string;
}

export interface CheckResult {
  budget: Bar;   // value = spent, limit = budget
  mass: Bar;     // value = total mass, limit = rocket capacity
  power: Bar;    // value = needed, limit = made
  dv: Bar;       // value = needed, limit = available
  window: ReturnType<typeof checkWindow>;
  comms: { fraction: number; ok: boolean };
  slots: { used: number; max: number; ok: boolean };
  tripDays: number;
  dryMassKg: number;      // mass without fuel
  dvNeededKmS: number;    // exact Δv the trip needs (dv.value is rounded)
  dvAvailableKmS: number; // exact Δv the fuel can give
  /** Braking burn into the chosen orbit at the target (km/s). Part of dvNeededKmS. */
  insertionDvKmS: number;
  /** The goal and orbit these numbers were worked out for. */
  plan: Plan;
  science: number;
  allOk: boolean;
  problems: string[];
}

export const findScenario = (id: string) => scenarios.find((s) => s.id === id)!;
export const getBody = (id: string) => parts.bodies.find((p) => p.id === id)!;
export const getInstrument = (id: string) => parts.instruments.find((p) => p.id === id)!;
export const getPower = (id: string) => parts.powerSources.find((p) => p.id === id)!;
export const getAntenna = (id: string) => parts.antennas.find((p) => p.id === id)!;
export const getEngine = (id: string) => parts.engines.find((p) => p.id === id)!;
export const getRocket = (id: string) => parts.rockets.find((p) => p.id === id)!;

export function runChecks(design: Design, scenario: Scenario, launchMonth: number, route: Route, plan: Plan = defaultPlan(scenario.id)): CheckResult {
  const body = getBody(design.bodyId);
  const instruments = design.instrumentIds.map(getInstrument);
  const power = getPower(design.powerId);
  const antenna = getAntenna(design.antennaId);
  const engine = getEngine(design.engineId);
  const rocket = getRocket(design.rocketId);

  // --- Budget ---
  const spent =
    body.cost + instruments.reduce((s, i) => s + i.cost, 0) + power.cost + antenna.cost + engine.cost + rocket.cost +
    design.fuelKg * parts.fuelPricePerKg;

  // --- Mass (Check 1) ---
  const dryMass = body.mass + instruments.reduce((s, i) => s + i.mass, 0) + power.mass + antenna.mass + engine.mass;
  const totalMass = dryMass + design.fuelKg;

  // --- Fuel / Δv (Check 2) ---
  const win = checkWindow(launchMonth, scenario.windowMonths, scenario.windowOffset);
  // the scenario's deltaV was set for its usual orbit; another orbit changes only the braking burn at the end,
  // by the real difference between the two capture burns (physics/orbits.ts)
  const usual = defaultPlan(scenario.id).orbitId;
  const insertionDv = scenario.insertionDeltaV + insertionDeltaV(scenario.id, plan.orbitId) - insertionDeltaV(scenario.id, usual);
  const dvNeeded = scenario.deltaV * ROUTE[route].dvMultiplier * (isFinite(win.dvMultiplier) ? win.dvMultiplier : 1)
    + insertionDv - scenario.insertionDeltaV;
  const dvAvailable = deltaV(engine.isp, totalMass, dryMass);

  // --- Power (Check 3) ---
  const made = powerMade(power, scenario.distanceAU);
  const needed = instruments.reduce((s, i) => s + i.power, 0) + antenna.power + engine.powerNeed;

  // --- Comms ---
  const dataNeed = instruments.reduce((s, i) => s + i.dataNeed, 0);
  const fraction = dataReturnedFraction(antenna.dataRate, scenario.commsFactor, dataNeed);

  const slots = { used: instruments.length, max: body.slots, ok: instruments.length <= body.slots };
  const science = Math.round(planScience(scenario.id, plan, instruments) * fraction);
  const tripDays = Math.round(scenario.tripDays * ROUTE[route].timeMultiplier * (engine.id === "ion" ? 1.5 : 1));

  const budget: Bar = { value: round(spent), limit: scenario.budget, ok: spent <= scenario.budget, label: "Budget ($M)",
    hint: `$${round(spent)}M spent of $${scenario.budget}M` };
  const mass: Bar = { value: Math.round(totalMass), limit: rocket.capacity, ok: totalMass <= rocket.capacity, label: "Mass (kg)",
    hint: `${Math.round(totalMass).toLocaleString()} kg · rocket lifts ${rocket.capacity.toLocaleString()} kg` };
  const powerBar: Bar = { value: Math.round(needed), limit: Math.round(made), ok: needed <= made, label: "Power (W)",
    hint: `uses ${Math.round(needed)} W · makes ${Math.round(made)} W there` };
  const dv: Bar = { value: round(dvNeeded), limit: round(dvAvailable), ok: dvAvailable >= dvNeeded && win.status !== "closed", label: "Fuel Δv (km/s)",
    hint: `trip needs ${round(dvNeeded)} · fuel gives ${round(dvAvailable)} km/s` };

  const problems: string[] = [];
  if (!slots.ok) problems.push(`This bus has room for ${body.slots} instruments. You chose ${instruments.length}.`);
  if (!budget.ok) problems.push(`Over budget by $${round(spent - scenario.budget)}M.`);
  if (!mass.ok) problems.push(`Your spacecraft is too heavy for this rocket (${Math.round(totalMass)} kg > ${rocket.capacity} kg).`);
  if (!powerBar.ok) problems.push(`Not enough power at the target: you make ${Math.round(made)} W but need ${Math.round(needed)} W.`);
  if (win.status === "closed") problems.push(win.message);
  else if (dvAvailable < dvNeeded) problems.push(`Not enough fuel: you can change speed by ${round(dvAvailable)} km/s but the trip needs ${round(dvNeeded)} km/s.`);
  if (fraction < 0.5) problems.push(`Your antenna is too weak: only ${Math.round(fraction * 100)}% of the data will reach Earth.`);

  return {
    budget, mass, power: powerBar, dv, window: win,
    comms: { fraction, ok: fraction >= 0.5 }, slots, tripDays, science, dryMassKg: dryMass, dvNeededKmS: dvNeeded, dvAvailableKmS: dvAvailable,
    insertionDvKmS: insertionDv, plan,
    allOk: problems.length === 0, problems,
  };
}

const round = (n: number) => Math.round(n * 100) / 100;
