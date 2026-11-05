/**
 * The Flight Director explains how the mission went.
 *
 * 1. buildSummary() turns the flown mission and the design into a small JSON report (no personal data).
 * 2. explainMission() writes 3–5 plain sentences from that report. Works offline, always.
 * 3. fetchFlightDirector() sends the report to the optional server in /server and returns the text an
 *    AI model wrote, or null on any problem, so the screen shows explainMission() instead.
 */
import parts from "../data/parts.json";
import events from "../data/events.json";
import realMissions from "../data/realMissions.json";
import lines from "../data/directorLines.json";
import type { CheckResult, Design, Scenario } from "../physics/checks";
import { getAntenna, getBody, getEngine, getInstrument, getPower, getRocket } from "../physics/checks";
import { solarPowerAt } from "../physics/power";
import { findObjective, findOrbit, fitWord, orbitFit } from "../physics/plan";
import type { Route } from "../physics/windows";
import { FAILED_TEXT, type Decision, type SimState } from "../sim/simulation";
import { scoreMission, type Score } from "../sim/score";

export type RealMission = (typeof realMissions)[number];
export interface RealMissionCard { id: string; name: string; agency: string; year: number; fact: string; comparison: string }

/** Everything the Flight Director (rules or AI) needs to know. Numbers only, no personal data. */
export interface MissionSummary {
  scenario: { id: string; name: string; target: string; budgetM: number; distanceAU: number; tripDays: number };
  design: {
    body: string; instruments: string[]; power: string; powerType: string; antenna: string; engine: string; rocket: string;
    fuelKg: number; route: Route; launchMonth: number; backupSystems: boolean;
  };
  checks: {
    allOk: boolean; costM: number; budgetOk: boolean; massKg: number; massLimitKg: number;
    powerMadeW: number; powerNeededW: number; smallestPanelsW: number;
    biggerAntennaExists: boolean; commsFraction: number;
    dvNeededKmS: number; dvAvailableKmS: number;
  };
  flight: {
    flown: boolean; outcome: "orbit" | "failed" | "not flown"; reason: string;
    scienceCollected: number; scienceMax: number; fuelLeftKg: number; fuelStartKg: number; powerAtTargetW: number;
    decisions: Decision[];
  };
  score: Score;
  realMissions: RealMissionCard[];
  /** Stage 17: the goal and orbit the player chose. Optional so older saved summaries still read. */
  plan?: { goal: string; goalIcon: string; orbit: string; orbitIcon: string; orbitFit: number; fitWord: string; insertionDvKmS: number };
}

export function buildSummary(
  sim: SimState | null, design: Design, scenario: Scenario, launchMonth: number, route: Route, check: CheckResult,
): MissionSummary {
  const body = getBody(design.bodyId);
  const power = getPower(design.powerId);
  const antenna = getAntenna(design.antennaId);
  const engine = getEngine(design.engineId);
  const rocket = getRocket(design.rocketId);
  const flown = sim !== null;
  const outcome = !flown ? "not flown" : sim.phase === "failed" ? "failed" : "orbit";
  const reason = flown && sim.phase === "failed" && sim.log.length > 0 ? sim.log[sim.log.length - 1].text : "";
  const smallestPanelsW = Math.min(
    ...parts.powerSources.filter((p) => p.type === "solar").map((p) => solarPowerAt(p.powerAt1AU, scenario.distanceAU)),
  );
  const player = { powerType: power.type, rocket: design.rocketId, target: scenario.targetProse };
  return {
    scenario: {
      id: scenario.id, name: scenario.name, target: scenario.targetProse, budgetM: scenario.budget,
      distanceAU: scenario.distanceAU, tripDays: check.tripDays,
    },
    design: {
      body: body.name, instruments: design.instrumentIds.map((id) => getInstrument(id).name),
      power: power.name, powerType: power.type, antenna: antenna.name, engine: engine.name, rocket: rocket.name,
      fuelKg: design.fuelKg, route, launchMonth, backupSystems: body.backup === true,
    },
    checks: {
      allOk: check.allOk, costM: check.budget.value, budgetOk: check.budget.ok,
      massKg: check.mass.value, massLimitKg: check.mass.limit,
      powerMadeW: check.power.limit, powerNeededW: check.power.value, smallestPanelsW: Math.round(smallestPanelsW),
      biggerAntennaExists: parts.antennas.some((a) => a.dataRate > antenna.dataRate),
      commsFraction: check.comms.fraction, dvNeededKmS: check.dv.value, dvAvailableKmS: check.dv.limit,
    },
    flight: {
      flown, outcome, reason,
      scienceCollected: flown ? sim.scienceCollected : check.allOk ? check.science : 0,
      scienceMax: check.science,
      fuelLeftKg: flown ? Math.round(sim.fuelKg) : design.fuelKg,
      fuelStartKg: design.fuelKg,
      powerAtTargetW: flown ? Math.round(sim.powerW) : check.power.limit,
      decisions: flown ? sim.decisions : [],
    },
    score: scoreMission(sim, check),
    plan: planSummary(scenario.id, check),
    realMissions: scenario.realMissionIds
      .map((id) => realMissions.find((m) => m.id === id))
      .filter((m): m is RealMission => m !== undefined)
      .map((m) => ({ id: m.id, name: m.name, agency: m.agency, year: m.year, fact: m.fact, comparison: compareWithRealMission(player, m) })),
  };
}

function planSummary(scenarioId: string, check: CheckResult): MissionSummary["plan"] {
  const objective = findObjective(scenarioId, check.plan.objectiveId);
  const orbit = findOrbit(scenarioId, check.plan.orbitId);
  const fit = orbitFit(objective, orbit.id);
  return { goal: objective.name, goalIcon: objective.icon, orbit: orbit.name, orbitIcon: orbit.icon, orbitFit: fit, fitWord: fitWord(fit),
    insertionDvKmS: Math.round(check.insertionDvKmS * 100) / 100 };
}

// ---------- Rule-based explanation (always available) ----------

export type Outcome =
  | "insertionFuel" | "powerLow" | "weakAntenna" | "stormNoBackup" | "dustIgnored" | "driftIgnored"
  | "overCarriedFuel" | "overSizedPanels" | "perfect" | "overBudget" | "lost" | "good";

/**
 * The one thing that best describes how the mission went. Checked from most to least serious.
 * A dish that is already the biggest one is only called weak when it loses half the data or more:
 * far from Earth, some loss is simply the distance, and the Design Lab said so before launch.
 */
export function outcomeOf(s: MissionSummary): Outcome {
  const f = s.flight;
  const c = s.checks;
  if (f.outcome === "failed") {
    if (f.reason === FAILED_TEXT) return "insertionFuel";
    if (/storm/i.test(f.reason)) return "stormNoBackup";
    if (/off course/i.test(f.reason)) return "driftIgnored";
    return "lost";
  }
  if (!f.flown) {
    if (!c.budgetOk) return "overBudget";
    if (c.powerMadeW < c.powerNeededW) return "powerLow";
    if (c.commsFraction < 0.5) return "weakAntenna";
  }
  const paidFor = (eventId: string) => f.decisions.some((d) => d.eventId === eventId && d.hurt);
  if (paidFor("dust")) return "dustIgnored";
  if (paidFor("courseDrift")) return "driftIgnored";
  if (f.powerAtTargetW < c.powerNeededW) return "powerLow";
  if (c.commsFraction < 1 && (c.biggerAntennaExists || c.commsFraction <= 0.5)) return "weakAntenna";
  if (c.dvAvailableKmS > c.dvNeededKmS * 1.5) return "overCarriedFuel";
  if (s.design.powerType === "solar" && c.powerMadeW > c.smallestPanelsW && c.smallestPanelsW >= c.powerNeededW) return "overSizedPanels";
  if (f.scienceCollected >= 0.9 * f.scienceMax && !f.decisions.some((d) => d.hurt)) return "perfect";
  return "good";
}

/** Fill {placeholders} in a sentence from src/data/directorLines.json. */
const say = (template: string, values: Record<string, string | number> = {}) =>
  template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ""));

function tip(s: MissionSummary, o: Outcome): string {
  const tips = lines.tips as Record<string, string>;
  if (o === "weakAntenna" && !s.checks.biggerAntennaExists) return tips.weakAntennaNoBigger;
  // an opportunity can push the score to the top, and then there are no missing points to hunt for
  if (o === "good" && s.flight.scienceCollected >= s.flight.scienceMax) return tips.goodFullScience;
  return tips[o];
}

/** 3–5 short sentences: what happened, the best and worst choice, one tip, one real mission. */
export function explainMission(s: MissionSummary): string {
  const outcome = outcomeOf(s);
  const sentences = [why(s, outcome), ...decisionLines(s), tip(s, outcome)];
  const m = s.realMissions[0];
  if (m) sentences.push(say(lines.realMission, { name: m.name, agency: m.agency, year: m.year, fact: firstSentence(m.fact) }));
  return sentences.slice(0, 5).join(" ");
}

/**
 * What happened, in one sentence. This function only decides WHICH sentence fits and what to put in
 * its blanks; the sentences themselves live in src/data/directorLines.json.
 */
function why(s: MissionSummary, o: Outcome): string {
  const c = s.checks;
  const f = s.flight;
  const w = lines.why as Record<string, string>;
  const values = {
    target: s.scenario.target,
    power: lower(s.design.power),
    make: s.design.powerType === "rtg" ? "makes" : "make",
    // what the spacecraft is making now: the sentence about not enough power is about the flight
    powerMade: f.flown ? f.powerAtTargetW : c.powerMadeW,
    // what the panels make by design: the sentence about oversized panels judges what you BOUGHT,
    // so a power penalty picked up on the way must not change it
    panelOutput: c.powerMadeW,
    powerNeeded: c.powerNeededW,
    antenna: lower(s.design.antenna),
    dataPct: Math.round(c.commsFraction * 100),
    dvAvailable: c.dvAvailableKmS,
    dvNeeded: c.dvNeededKmS,
    costM: c.costM,
    budgetM: s.scenario.budgetM,
    reason: lower(firstSentence(f.reason)),
    science: f.scienceCollected,
    scienceMax: f.scienceMax,
    extra: f.scienceCollected - f.scienceMax,
  };
  switch (o) {
    case "weakAntenna":
      return say(c.biggerAntennaExists ? w.weakAntenna : w.weakAntennaNoBigger, values);
    case "driftIgnored":
      return say(f.outcome === "failed" ? w.driftIgnoredLost : w.driftIgnored, values);
    case "perfect":
      return say(c.commsFraction < 1 ? w.perfectSomeDataLost : w.perfect, values);
    case "good":
      // a chance taken can bring home more than the plan asked for, and that is worth saying as a win
      return say(f.scienceCollected > f.scienceMax ? w.goodOverPlan : w.good, values);
    default:
      return say(w[o], values);
  }
}

/** True when the player picked an option events.json marks as safe (the cautious choice). */
type EventRow = { id: string; kind?: string; follows?: { eventId: string; optionId: string }; options: { id: string; safe?: boolean }[] };
const eventRow = (id: string) => (events as EventRow[]).find((e) => e.id === id);

function isSafeChoice(d: Decision): boolean {
  const opt = eventRow(d.eventId)?.options.find((o) => o.id === d.optionId);
  return opt?.safe === true;
}

/** A chance the player took that really paid off. */
function opportunityTaken(chosen: Decision[]): Decision | undefined {
  return chosen.find((d) => d.gain && eventRow(d.eventId)?.kind === "opportunity");
}

/**
 * An event that happened only because of an earlier choice, with the choice that caused it.
 * This is the lesson of the stage, so it is worth a sentence of its own.
 */
function followUpWithCause(all: Decision[]): { effect: Decision; cause: Decision } | undefined {
  for (const effect of all) {
    const follows = eventRow(effect.eventId)?.follows;
    if (!follows) continue;
    const cause = all.find((d) => d.eventId === follows.eventId && d.optionId === follows.optionId);
    if (cause) return { effect, cause };
  }
  return undefined;
}

/**
 * Best = a choice that cost nothing. Worst = only a RISKY choice that hurt (a safe choice that cost a little
 * science is the price of safety, never "worst" — that word would teach the wrong lesson).
 */
function decisionLines(s: MissionSummary): string[] {
  const chosen = s.flight.decisions.filter((d) => d.optionId !== "auto");
  if (chosen.length === 0) return [];
  const best = chosen.find((d) => !d.hurt);
  const worst = chosen.find((d) => d.hurt && !isSafeChoice(d));
  const safeCost = chosen.find((d) => d.hurt && isSafeChoice(d));
  const out: string[] = [];
  const d = lines.decisions as Record<string, string>;
  const chance = opportunityTaken(chosen);
  const chain = followUpWithCause(s.flight.decisions);
  // the chain of consequences teaches the most, so it takes a slot before praise
  // when the chance the player took is also what caused the follow-up, that is one story, not two
  const sameChoice = chain && chance && chain.cause.day === chance.day && chain.cause.eventId === chance.eventId;
  const causeLine = chain
    ? sameChoice
      ? say(d.chanceThatCaused, { causeDay: chain.cause.day, event: lower(withThe(chain.effect.event)), eventDay: chain.effect.day })
      : say(d.cause, { event: withThe(chain.effect.event), eventDay: chain.effect.day, causeDay: chain.cause.day, option: lower(chain.cause.option) })
    : null;
  const goodLine = chance && !sameChoice ? say(d.chance, { day: chance.day, option: lower(chance.option) }) : null;

  if (!worst) {
    // the merged line already praises that choice, so nothing else should mention it again
    if (sameChoice && causeLine) return [causeLine];
    if (goodLine) out.push(goodLine);
    else if (safeCost) out.push(say(d.everySafe, { day: safeCost.day, option: lower(safeCost.option) }));
    else if (best) out.push(say(d.everyGood, { day: best.day, option: lower(best.option) }));
    if (causeLine && out.length < 2) out.push(causeLine);
    return out;
  }
  if (causeLine) out.push(causeLine);
  else if (goodLine) out.push(goodLine);
  else if (best) out.push(say(d.best, { day: best.day, option: lower(best.option) }));
  out.push(say(d.riskiest, { day: worst.day, option: lower(worst.option) }));
  return out;
}

/** One line comparing the player's design with a real mission, e.g. "You used solar panels at Jupiter, like Juno." */
export function compareWithRealMission(
  player: { powerType: string; rocket: string; target: string },
  m: Pick<RealMission, "name" | "power" | "rocket">,
): string {
  const c = lines.compare as Record<string, string>;
  const describe = (p: string) => (p === "rtg" ? c.rtg : c.solar);
  const alsoRocket = player.rocket === m.rocket ? say(c.sameRocket, { mission: m.name, rocket: m.rocket }) : "";
  return player.powerType === m.power
    ? say(c.samePower, { power: describe(m.power), target: player.target, mission: m.name, alsoRocket })
    : say(c.differentPower, { mission: m.name, theirPower: describe(m.power), yourPower: describe(player.powerType), alsoRocket });
}

const lower = (text: string) => (text ? text.charAt(0).toLowerCase() + text.slice(1) : text);
/** "Damage found" → "The damage found"; "The new instrument is working well" is left alone. */
const withThe = (name: string) => (/^the\s/i.test(name) ? `The ${name.slice(4)}` : `The ${lower(name)}`);
const firstSentence = (text: string) => {
  const first = text.split(/(?<=[.!?])\s+/)[0] ?? text;
  return /[.!?]$/.test(first) ? first : `${first}.`;
};

// ---------- AI path (optional server, see /server) ----------

/**
 * POST the report to the Flight Director server and return the text it wrote.
 * Returns null on any error, a non-OK status, an empty answer, or after `timeoutMs`,
 * so the caller can fall back to explainMission().
 */
export async function fetchFlightDirector(
  summary: MissionSummary, url: string, timeoutMs = 6000, fetchFn: typeof fetch = fetch,
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchFn(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(summary),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    const text = data && typeof data === "object" && typeof (data as { text?: unknown }).text === "string"
      ? (data as { text: string }).text.trim()
      : "";
    return text.length > 0 ? text : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
