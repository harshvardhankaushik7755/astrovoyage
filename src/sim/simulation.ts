/**
 * Cruise simulation engine (pure TypeScript, no React).
 *
 * createSimulation() turns a finished design into a starting state.
 * step(state, days) moves the mission forward and returns a NEW state. It never
 * changes the state you pass in. The Mission Control screen calls step() every frame.
 *
 * Flight path: a Hohmann-style half-ellipse from the departure orbit (angle 0) to the
 * target orbit (angle 180° on arrival day). Kepler's equation gives the real speed along
 * that ellipse: fast near the inner body, slow near the outer one.
 * Sun-centred trips (Mars, Jupiter) start on Earth's orbit, 1 AU from the Sun.
 * Earth-centred trips (Moon) start in a low parking orbit around Earth.
 *
 * Fuel: the scenario Δv checked in the Design Lab covers the whole trip. The engine splits it into
 * a cruise burn (total minus insertionDeltaV) and the braking burn at arrival, so a design that
 * passes the fuel check reaches orbit unless something on the way costs extra fuel.
 *
 * Challenges: 2–4 surprise events per mission, drawn from src/data/events.json with a seeded
 * random generator so a run can be replayed. When one fires, time stops until resolveEvent()
 * applies the option the player chose. Options cost fuel, science, power or signal, or take a
 * risk of losing the spacecraft. Protections in the design (backup systems, RTG, large antenna,
 * three instruments) soften or remove the damage, and the log says so.
 */
import events from "../data/events.json";
import settings from "../data/settings.json";
import type { CheckResult, Design, Scenario } from "../physics/checks";
import { getBody, getEngine, getPower } from "../physics/checks";
import type { Route } from "../physics/windows";
import type { Plan } from "../physics/plan";
import type { ShipPart } from "./shipLayout";
import { deltaV, fuelBurned } from "../physics/rocketEquation";
import { powerMade } from "../physics/power";
import { LIGHT_MINUTES_PER_AU, formatSignalDelay } from "../physics/comms";

// the light-time constant and the delay wording live with the other real formulas, in src/physics
export { LIGHT_MINUTES_PER_AU, formatSignalDelay };

// ---------- Real physical constants (not game numbers) ----------
export const AU_KM = 149_597_870.7;              // one astronomical unit in km
export const EARTH_ORBIT_AU = 1;                 // Earth's distance from the Sun
export const EARTH_ORBIT_DAYS = 365.25;          // one Earth year
export const PARKING_ORBIT_AU = 6_578 / AU_KM;   // 200 km above Earth: where Moon trips start
/** Real seconds the whole cruise should take on screen (CLAUDE.md time-scale rule). */
export const CRUISE_SECONDS = settings.cruiseSeconds;

const TAU = 2 * Math.PI;

export type Phase = "cruise" | "insertion" | "orbit" | "failed" | "done";
export type CentralBody = "sun" | "earth";
export type Planet = "earth" | "target";
export interface LogLine { day: number; text: string }

// ---------- Challenges: data types (see src/data/events.json) ----------

/** What an option does. Penalties are fractions (0.1 = 10%). Risks are chances (0.25 = 1 in 4). */
export interface EventEffect {
  fuelCost?: number;        // kg of fuel burned now
  sciencePenalty?: number;  // science lost
  powerPenalty?: number;    // power lost for the rest of the trip
  signalPenalty?: number;   // signal lost for the rest of the trip
  riskOfFailure?: number;   // chance of losing the spacecraft right now
  riskAtInsertion?: number; // chance of missing the target when you arrive
  daysLost?: number;        // mission days lost: the clock jumps forward
  scienceBonus?: number;    // science GAINED (0.15 = +15%)
  fuelSaved?: number;       // kg of fuel given back
  clearInsertionRisk?: boolean; // a clean-up burn: the chance of missing the target goes back to zero
  none?: boolean;
}
export interface EventOptionDef {
  id: string;
  label: string;
  effect: EventEffect;
  protectedEffect?: EventEffect; // used instead of `effect` when the design has the protection
  onlyIf?: string;               // only offered when the design has this flag (e.g. "antLarge")
  safe?: boolean;                // the choice mission control prefers when the player is silent
}
/** A crisis to survive, or a chance worth taking. */
export type EventKind = "problem" | "opportunity";
/** When in the trip an event can happen: the window is cut into three equal slices. */
export type EventPhase = "early" | "mid" | "late" | "any";
/** What has to be chosen for a follow-up event to happen later. */
export interface EventTrigger { eventId: string; optionId: string }

export interface EventDef {
  id: string;
  name: string;
  chance: number;                // relative likelihood of being picked for a mission
  explain: string;               // one line in simple English; {target} is filled in
  /** the part of the spacecraft this happens to, or null when it happens to the whole mission */
  affectsPart: ShipPart | null;
  kind?: EventKind;              // default "problem"
  phase?: EventPhase;            // default "any"
  follows?: EventTrigger;        // set → never drawn at the start, only caused by that choice
  onlyIf?: string;               // only possible with this flag (e.g. "dustRisk", "hasInstruments")
  protectedBy?: string;          // design flag that softens the event
  protectedText?: string;        // what the log says when the protection worked
  autoResolveWhenProtected?: boolean; // protected → no decision needed at all
  failText?: string;             // what the log says when a risk goes wrong
  whatIsIt?: string;             // one or two plain sentences: what this thing is
  realExample?: string;          // one real mission and year, one sentence
  howCommon?: string;            // short phrase
  verify?: boolean;              // true when the real example still needs fact-checking
  options: EventOptionDef[];
}
/**
 * JSON gives every string the type `string`, so `kind` and `phase` have to be narrowed here.
 * The data test in src/sim/__tests__/context.test.ts checks that every value really is one of
 * the words this file allows, so a typo in events.json fails the build's tests, not silently.
 */
export const EVENT_DEFS: EventDef[] = events as EventDef[];

export interface ScheduledEvent { day: number; eventId: string; causedOnDay?: number }
/** An option as offered to the player: protection applied, {target} filled in. */
export interface EventOption { id: string; label: string; effect: EventEffect; safe: boolean; shielded: boolean; warning?: string }
/** A challenge waiting for the player. Time stands still until resolveEvent() is called. */
export interface SimEvent {
  id: string; name: string; explain: string; day: number;
  kind: EventKind;
  /** which part of the player's spacecraft this is happening to, for the schematic on the card */
  affectsPart: ShipPart | null;
  /** Set when this event was caused by an earlier choice: the day that choice was made. */
  causedOnDay?: number;
  protected: boolean; protectedText: string; failText: string;
  options: EventOption[];
}
/**
 * One challenge and what came of it.
 * hurt = it cost science, power or signal, took a risk, or doomed the braking burn.
 * gain = it won science, days or fuel back and nothing bad came with it.
 */
export interface Decision {
  day: number; event: string; eventId: string; option: string; optionId: string;
  outcome: string; hurt: boolean; gain: boolean; effect: EventEffect;
}

/** Everything step() needs that never changes during a mission. Built once by createSimulation(). */
export interface SimConfig {
  scenarioId: string;
  targetName: string;          // for sentences: "the Moon", "Mars"
  route: Route;
  launchMonth: number;
  centralBody: CentralBody;
  departureRadiusAU: number;
  targetOrbitRadiusAU: number;
  targetOrbitDays: number;
  insertionDeltaV: number;     // km/s to slow down into orbit at the target
  /** The goal and orbit the mission flies (Stage 17). Optional so older test configs still build. */
  plan?: Plan;
  isp: number;
  burnProfile: "impulsive" | "continuous"; // chemical burns at departure, ion burns all the way
  dryMassKg: number;
  fuelStartKg: number;
  cruiseDeltaV: number;        // km/s for the cruise: the scenario total minus the insertion burn
  powerSource: { type: string; powerAt1AU: number };
  powerNeededW: number;
  scienceTotal: number;        // science points if everything goes well
  flags: string[];             // what the design has: part ids plus "backup", "rtg", "threeInstruments", "hasInstruments", "dustRisk"
  seed: number;                // random seed, so a mission can be replayed
}

export interface SimState {
  config: SimConfig;
  missionDay: number;
  totalDays: number;           // cruise length in days
  phase: Phase;                // "done" is reserved for the end of the science phase (later stage)
  fuelKg: number;
  powerW: number;              // power made at the current distance from the Sun (after penalties)
  powerNeededW: number;
  signalStrength: number;      // 0–1, 1 next to Earth (after penalties)
  signalDelayMinutes: number;  // one-way light time to Earth
  distanceFromEarthAU: number;
  distanceFromSunAU: number;
  /** Where the spacecraft is, measured from the central body (Sun, or Earth for Moon trips). */
  spacecraft: { radiusAU: number; angleRad: number };
  earthAngleRad: number;       // 0 when Earth is the central body
  targetAngleRad: number;
  scienceCollected: number;
  log: LogLine[];              // oldest first
  pendingEvent: SimEvent | null;
  upcoming: ScheduledEvent[];  // challenges still to come, earliest first
  rngState: number;            // seeded random generator state (see nextRandom)
  eventFuelKg: number;         // fuel spent on challenges so far
  scienceFactor: number;       // 1 = no science lost
  powerFactor: number;         // 1 = no power lost
  signalFactor: number;        // 1 = no signal lost
  insertionRisk: number;       // chance of missing the target at arrival (from ignored problems)
  insertionRiskText: string;
  /** Every gamble taken so far, combined: the chance that something goes wrong before arrival. */
  riskTaken: number;
  decisions: Decision[];
}

const MILESTONES: { at: number; text: string }[] = [
  { at: 0, text: "Left Earth's gravity" },
  { at: 0.25, text: "Mid-course correction" },
  { at: 0.5, text: "Halfway there" },
  { at: 0.75, text: "Approaching target" },
  { at: 1, text: "Orbit insertion burn" },
];
/** The lines the log writes as the trip passes each stage. They are never the outcome of anything. */
export const MILESTONE_TEXTS: string[] = MILESTONES.map((m) => m.text);
export const ORBIT_TEXT = "Orbit captured! The spacecraft is going round its target.";
export const FAILED_TEXT = "Not enough fuel to slow down. The spacecraft flew past the planet.";
export const LOST_TEXT = "The spacecraft was lost.";
export const AUTO_CHOICE_TEXT = "Mission control chose for you";
const NO_DECISION = "No decision needed";

// ---------- Creating and stepping ----------

/**
 * Build the starting state. `seed` makes the challenges repeatable (a random one is drawn when
 * it is left out). `schedule` replaces the random challenges, for tests and demos.
 */
export function createSimulation(
  design: Design, scenario: Scenario, launchMonth: number, route: Route, check: CheckResult,
  seed?: number, schedule?: ScheduledEvent[],
): SimState {
  const body = getBody(design.bodyId);
  const engine = getEngine(design.engineId);
  const power = getPower(design.powerId);
  const centralBody: CentralBody = scenario.centralBody === "earth" ? "earth" : "sun";
  const theSeed = (seed ?? Math.floor(Math.random() * 2147483647)) >>> 0;
  const config: SimConfig = {
    scenarioId: scenario.id,
    targetName: scenario.targetProse,
    route,
    launchMonth,
    centralBody,
    departureRadiusAU: centralBody === "earth" ? PARKING_ORBIT_AU : EARTH_ORBIT_AU,
    targetOrbitRadiusAU: scenario.targetOrbitRadiusAU,
    targetOrbitDays: scenario.targetOrbitDays,
    insertionDeltaV: check.insertionDvKmS,
    plan: check.plan,
    isp: engine.isp,
    burnProfile: engine.burnProfile === "continuous" ? "continuous" : "impulsive",
    dryMassKg: check.dryMassKg,
    fuelStartKg: design.fuelKg,
    cruiseDeltaV: Math.max(0, check.dvNeededKmS - check.insertionDvKmS),
    powerSource: { type: power.type, powerAt1AU: power.powerAt1AU },
    powerNeededW: check.power.value,
    scienceTotal: check.science,
    flags: designFlags(design, scenario, body.backup === true, power.type),
    seed: theSeed,
  };
  const totalDays = Math.max(1, check.tripDays);
  const planned = schedule
    ? { events: [...schedule].sort((a, b) => a.day - b.day), state: theSeed }
    : scheduleEvents(theSeed, config.flags, totalDays);
  return {
    config,
    missionDay: 0,
    totalDays,
    phase: "cruise",
    fuelKg: design.fuelKg,
    powerNeededW: config.powerNeededW,
    scienceCollected: 0,
    log: [{ day: 0, text: MILESTONES[0].text }],
    pendingEvent: null,
    upcoming: planned.events,
    rngState: planned.state,
    eventFuelKg: 0,
    scienceFactor: 1,
    powerFactor: 1,
    signalFactor: 1,
    insertionRisk: 0,
    insertionRiskText: "",
    riskTaken: 0,
    decisions: [],
    ...readings(config, 0, totalDays, 1, 1),
  };
}

/** Flags that events and options can ask for with `onlyIf` and `protectedBy`. */
function designFlags(design: Design, scenario: Scenario, backup: boolean, powerType: string): string[] {
  const flags = [design.bodyId, design.powerId, design.antennaId, design.engineId, design.rocketId, ...design.instrumentIds];
  if (backup) flags.push("backup");
  if (powerType === "rtg") flags.push("rtg");
  if (design.instrumentIds.length >= 1) flags.push("hasInstruments");
  if (design.instrumentIds.length >= 3) flags.push("threeInstruments");
  if (scenario.dustRisk > 0) flags.push("dustRisk");
  flags.push(scenario.id);                                   // "moon", "mars", "jupiter"
  if (scenario.targetOrbitRadiusAU > 2.0) flags.push("outerPlanet"); // beyond the asteroid belt, so not Mars
  if (powerType === "solar") flags.push("solar");
  return flags;
}

/**
 * Advance the mission by `days`. Returns a new state; the input is never changed.
 * - While a challenge waits for a decision, time does not move (see resolveEvent).
 * - A step that reaches a challenge stops at that day and sets pendingEvent.
 * - The cruise ends at totalDays with phase "insertion"; the next call performs the
 *   insertion burn and settles into "orbit" or "failed".
 * - After that, step() returns the state unchanged.
 */
export function step(state: SimState, days: number): SimState {
  if (state.pendingEvent) return state;
  if (state.phase === "insertion") return insertionBurn(state);
  if (state.phase !== "cruise" || !(days > 0)) return state;

  const c = state.config;
  const T = state.totalDays;
  const day0 = state.missionDay;
  let day1 = Math.min(T, day0 + days);

  // Challenges due by day1. Ones the design is protected against just write to the log;
  // the first one that needs a decision stops the clock at its day.
  const upcoming = [...state.upcoming];
  const decisions = [...state.decisions];
  const eventLines: LogLine[] = [];
  let pendingEvent: SimEvent | null = null;
  while (upcoming.length > 0 && upcoming[0].day <= day1) {
    const due = upcoming.shift()!;
    const def = EVENT_DEFS.find((e) => e.id === due.eventId);
    if (!def) continue;
    const day = Math.max(day0, Math.min(due.day, T));
    const shielded = def.protectedBy !== undefined && c.flags.includes(def.protectedBy);
    eventLines.push({ day: Math.round(day), text: `${def.name}! ${fill(def.explain, c.targetName)}` });
    if (shielded && def.autoResolveWhenProtected) {
      const outcome = fill(def.protectedText ?? "Your design protected you.", c.targetName);
      eventLines.push({ day: Math.round(day), text: outcome });
      decisions.push({ day: Math.round(day), event: def.name, eventId: def.id, option: NO_DECISION, optionId: "auto", outcome, hurt: false, gain: false, effect: {} });
      continue;
    }
    const ev = buildEvent(def, day, state, shielded, due.causedOnDay);
    if (ev.options.length === 0) {
      // the data left the player nothing to choose: note it and carry on, never block the mission
      const outcome = "Nothing could be done about it.";
      eventLines.push({ day: ev.day, text: outcome });
      decisions.push({ day: ev.day, event: def.name, eventId: def.id, option: NO_DECISION, optionId: "auto", outcome, hurt: false, gain: false, effect: {} });
      continue;
    }
    pendingEvent = ev;
    day1 = day;
    break;
  }

  // Log the milestones passed and the challenges met, in day order (milestones first on the same day).
  const f0 = day0 / T;
  const f1 = day1 / T;
  const added: LogLine[] = MILESTONES
    .filter((m) => m.at > 0 && f0 < m.at && m.at <= f1)
    .map((m) => ({ day: Math.round(m.at * T), text: m.text }));
  added.push(...eventLines);
  added.sort((a, b) => a.day - b.day);
  const log = [...state.log, ...added];

  const fuelKg = fuelAt(c, f1, state.eventFuelKg);
  // the braking burn waits until every challenge has fired and been answered (a lost week can push the clock to the end early)
  const phase: Phase = f1 >= 1 && upcoming.length === 0 && !pendingEvent ? "insertion" : "cruise";

  return {
    ...state, missionDay: day1, phase, fuelKg, log, decisions, upcoming, pendingEvent,
    ...readings(c, day1, T, state.powerFactor, state.signalFactor),
  };
}

/** Fuel the whole cruise needs, given everything on board at launch. */
function cruiseBurnKg(c: SimConfig): number {
  return Math.min(c.fuelStartKg, fuelBurned(c.isp, c.dryMassKg + c.fuelStartKg, c.cruiseDeltaV));
}

/** Fuel on board at trip fraction f. A chemical engine burns its cruise fuel at departure; an ion engine spreads it out. */
function fuelAt(c: SimConfig, f: number, eventFuelKg: number): number {
  const burn = cruiseBurnKg(c);
  return Math.max(0, c.fuelStartKg - (c.burnProfile === "continuous" ? burn * f : burn) - eventFuelKg);
}

/** Would the braking burn at the target still be possible after spending `extraFuelKg` now? */
function insertionPossibleAfter(s: SimState, extraFuelKg: number): boolean {
  const c = s.config;
  const atArrival = Math.max(0, c.fuelStartKg - cruiseBurnKg(c) - s.eventFuelKg - extraFuelKg);
  return deltaV(c.isp, c.dryMassKg + atArrival, c.dryMassKg) >= c.insertionDeltaV;
}

/** The braking burn at the target. Enough fuel and no fatal drift → orbit. Otherwise the spacecraft flies past. */
function insertionBurn(s: SimState): SimState {
  const c = s.config;
  let rngState = s.rngState;
  if (s.insertionRisk > 0) {
    const roll = nextRandom(rngState);
    rngState = roll.state;
    if (roll.value < s.insertionRisk) {
      return { ...s, rngState, phase: "failed", log: [...s.log, { day: s.missionDay, text: s.insertionRiskText || FAILED_TEXT }] };
    }
  }
  const massBefore = c.dryMassKg + s.fuelKg;
  if (deltaV(c.isp, massBefore, c.dryMassKg) < c.insertionDeltaV) {
    return { ...s, rngState, phase: "failed", fuelKg: 0, log: [...s.log, { day: s.missionDay, text: FAILED_TEXT }] };
  }
  const fuelKg = s.fuelKg - fuelBurned(c.isp, massBefore, c.insertionDeltaV);
  const powerShare = s.powerNeededW > 0 ? Math.min(1, s.powerW / s.powerNeededW) : 1;
  const science = Math.round(c.scienceTotal * s.scienceFactor * s.signalFactor * powerShare);
  const log = [...s.log, { day: s.missionDay, text: ORBIT_TEXT }];
  if (science < c.scienceTotal) {
    const why = powerShare < 1 ? " There was not enough power to run every instrument." : "";
    log.push({ day: s.missionDay, text: `Science collected: ${science} of ${c.scienceTotal} points.${why}` });
  }
  return { ...s, rngState, phase: "orbit", fuelKg, scienceCollected: science, log };
}

// ---------- Challenges ----------

/** Fill {target} in event texts. */
const fill = (text: string, target: string) => text.replace(/\{target\}/g, target);
const pct = (x: number) => `${Math.round(x * 100)}%`;

/** The event window is cut into three equal slices, so a mission has a beginning, a middle and an end. */
const SLICES = 3;
const SLICE_OF: Record<EventPhase, number | null> = { early: 0, mid: 1, late: 2, any: null };

/**
 * Pick the challenges for a mission and spread them between 15% and 85% of the trip.
 * Events are drawn without repeats, weighted by `chance`, only from those whose `onlyIf` the
 * mission satisfies, and never one that only happens as a follow-up to a choice.
 * Each event lands in a slice of the trip its `phase` allows; an "any" event goes wherever
 * there is most room. Every draw comes from the seeded generator, so the same seed gives the
 * same challenges on the same days.
 */
function scheduleEvents(seed: number, flags: string[], totalDays: number): { events: ScheduledEvent[]; state: number } {
  let state = seed;
  const draw = () => {
    const r = nextRandom(state);
    state = r.state;
    return r.value;
  };
  const pool = EVENT_DEFS.filter((e) => !e.follows && (!e.onlyIf || flags.includes(e.onlyIf)));
  const { min, max } = settings.eventsPerMission;
  const count = Math.min(pool.length, min + Math.floor(draw() * (max - min + 1)));
  const rest = [...pool];
  const chosen: EventDef[] = [];
  for (let i = 0; i < count; i++) {
    const total = rest.reduce((sum, e) => sum + e.chance, 0);
    let r = draw() * total;
    let idx = 0;
    while (idx < rest.length - 1 && r >= rest[idx].chance) {
      r -= rest[idx].chance;
      idx++;
    }
    chosen.push(rest.splice(idx, 1)[0]);
  }
  // Put each event in the slice its phase allows; "any" fills the emptiest slice, so the
  // challenges stay spread over the whole trip however the draw went.
  const buckets: EventDef[][] = Array.from({ length: SLICES }, () => []);
  const anywhere: EventDef[] = [];
  for (const e of chosen) {
    const slice = SLICE_OF[e.phase ?? "any"];
    if (slice === null) anywhere.push(e);
    else buckets[slice].push(e);
  }
  for (const e of anywhere) {
    let emptiest = 0;
    for (let i = 1; i < SLICES; i++) if (buckets[i].length < buckets[emptiest].length) emptiest = i;
    buckets[emptiest].push(e);
  }
  const { from, to } = settings.eventWindow;
  const sliceWidth = (to - from) / SLICES;
  const events: ScheduledEvent[] = [];
  buckets.forEach((bucket, slice) => {
    const slot = sliceWidth / Math.max(1, bucket.length); // one challenge per equal part of the slice
    bucket.forEach((e, i) => {
      const at = from + slice * sliceWidth + slot * (i + draw());
      events.push({ day: Math.round(totalDays * at * 100) / 100, eventId: e.id });
    });
  });
  events.sort((a, b) => a.day - b.day);
  return { events, state };
}

/** Prepare a challenge for the player: filter the options, apply protection, warn about fatal fuel costs. */
function buildEvent(def: EventDef, day: number, s: SimState, shielded: boolean, causedOnDay?: number): SimEvent {
  const c = s.config;
  const options: EventOption[] = def.options
    .filter((o) => !o.onlyIf || c.flags.includes(o.onlyIf))
    .map((o) => {
      const useShield = shielded && o.protectedEffect !== undefined;
      const effect0 = useShield && o.protectedEffect ? o.protectedEffect : o.effect;
      // A delay can never run past the end of the trip, so the card offers the days it will really cost.
      // With less than a day left there is nothing to lose, and the option says so.
      const room = Math.floor(s.totalDays - day);
      let effect = effect0;
      if (effect0.daysLost) {
        const days = Math.min(effect0.daysLost, room);
        effect = { ...effect0 };
        if (days > 0) effect.daysLost = days;
        else delete effect.daysLost;
      }
      const fuel = effect.fuelCost ?? 0;
      const warning = fuel > 0 && !insertionPossibleAfter(s, fuel)
        ? `Then there will not be enough fuel left to slow down at ${c.targetName}.`
        : undefined;
      return { id: o.id, label: fill(o.label, c.targetName), effect, safe: o.safe === true, shielded: useShield, warning };
    });
  return {
    id: def.id,
    name: def.name,
    kind: def.kind ?? "problem",
    affectsPart: def.affectsPart,
    causedOnDay,
    explain: fill(def.explain, c.targetName),
    day: Math.round(day),
    protected: shielded,
    protectedText: fill(def.protectedText ?? "", c.targetName),
    failText: fill(def.failText ?? LOST_TEXT, c.targetName),
    options,
  };
}

/**
 * Apply the option the player chose (or, with auto = true, the one mission control chose when the
 * countdown ran out). Time can move again afterwards. Unknown options change nothing.
 */
export function resolveEvent(state: SimState, optionId: string, auto = false): SimState {
  const ev = state.pendingEvent;
  if (!ev) return state;
  const opt = ev.options.find((o) => o.id === optionId);
  if (!opt) return state;
  const c = state.config;
  const e = opt.effect;
  const parts: string[] = [];
  let { eventFuelKg, scienceFactor, powerFactor, signalFactor, insertionRisk, insertionRiskText, riskTaken, rngState } = state;
  let missionDay = state.missionDay;
  let failed = false;

  if (e.fuelCost) {
    eventFuelKg += e.fuelCost;
    parts.push(`Burned ${e.fuelCost} kg of fuel.`);
  }
  // whole days, counted the same way the card counted them: a float subtraction inside the floor
  // would quietly turn a promised 10 days into 9 (missionDay is rarely a round number)
  const daysLost = e.daysLost ? Math.max(0, Math.min(Math.floor(e.daysLost), Math.floor(state.totalDays - missionDay))) : 0;
  if (daysLost > 0) {
    // the clock jumps forward: days spent waiting are days of cruise gone
    missionDay += daysLost;
    parts.push(`Lost ${daysLost} ${daysLost === 1 ? "day" : "days"}.`);
  }
  if (e.fuelSaved) {
    // fuel given back, but a mission can never end up having spent less than nothing
    const back = Math.min(e.fuelSaved, eventFuelKg + e.fuelSaved);
    eventFuelKg = Math.max(0, eventFuelKg - e.fuelSaved);
    parts.push(`Saved ${back} kg of fuel.`);
  }
  if (e.sciencePenalty) {
    scienceFactor *= 1 - e.sciencePenalty;
    parts.push(`Science down ${pct(e.sciencePenalty)}.`);
  }
  if (e.scienceBonus) {
    scienceFactor *= 1 + e.scienceBonus;
    parts.push(`Science up ${pct(e.scienceBonus)}.`);
  }
  if (e.powerPenalty) {
    powerFactor *= 1 - e.powerPenalty;
    parts.push(`Power down ${pct(e.powerPenalty)} for the rest of the trip.`);
  }
  if (e.signalPenalty) {
    signalFactor *= 1 - e.signalPenalty;
    parts.push(`Signal down ${pct(e.signalPenalty)} for the rest of the trip.`);
  }
  if (e.clearInsertionRisk) {
    insertionRisk = 0;
    insertionRiskText = "";
    parts.push(`The aim is good again: no chance of missing ${c.targetName} now.`);
  }
  if (e.riskAtInsertion) {
    insertionRisk = 1 - (1 - insertionRisk) * (1 - e.riskAtInsertion);
    insertionRiskText = ev.failText;
    parts.push(`${Math.round(e.riskAtInsertion * 10)} in 10 chance of missing ${c.targetName} when you arrive.`);
  }
  // every gamble, of either kind, adds to the one number the top bar shows
  if (e.riskAtInsertion) riskTaken = 1 - (1 - riskTaken) * (1 - e.riskAtInsertion);
  if (e.riskOfFailure) riskTaken = 1 - (1 - riskTaken) * (1 - e.riskOfFailure);
  if (e.riskOfFailure) {
    const roll = nextRandom(rngState);
    rngState = roll.state;
    if (roll.value < e.riskOfFailure) {
      failed = true;
      parts.push(ev.failText);
    } else {
      parts.push("You took the risk and got away with it.");
    }
  }
  if (opt.shielded && ev.protectedText) parts.push(ev.protectedText);
  if (parts.length === 0) parts.push("No harm done.");

  const outcome = parts.join(" ");
  const log = [...state.log, { day: ev.day, text: `${auto ? AUTO_CHOICE_TEXT + ": " : "You chose: "}${opt.label}. ${outcome}` }];
  const hurt = !!(e.sciencePenalty || e.powerPenalty || e.signalPenalty || e.riskOfFailure || e.riskAtInsertion || opt.warning);
  // a gain is a choice that won something back and cost nothing lasting
  const gain = !!(e.scienceBonus || e.fuelSaved) && !hurt && !failed;
  const realised: EventEffect = { ...e };
  if (daysLost > 0) realised.daysLost = daysLost;
  const decisions = [...state.decisions, { day: ev.day, event: ev.name, eventId: ev.id, option: opt.label, optionId: opt.id, outcome, hurt, gain, effect: realised }];
  const T = state.totalDays;
  const passed = MILESTONES
    .filter((m) => m.at > 0 && state.missionDay / T < m.at && m.at <= missionDay / T)
    .map((m) => ({ day: Math.round(m.at * T), text: m.text }));
  log.push(...passed);
  const fuelKg = fuelAt(c, missionDay / T, eventFuelKg);
  // this choice may set a later event in motion
  const caused = followUpFor(state, ev.id, opt.id, ev.day, missionDay, rngState);
  const next: SimState = {
    ...state, pendingEvent: null, missionDay, fuelKg, eventFuelKg, scienceFactor, powerFactor, signalFactor,
    insertionRisk, insertionRiskText, riskTaken, rngState: caused.state, log, decisions,
    upcoming: caused.upcoming, phase: failed ? "failed" : state.phase,
  };
  return { ...next, ...readings(c, missionDay, T, powerFactor, signalFactor) };
}

/**
 * A choice can set a later event in motion. The follow-up lands between 20% and 60% of the trip
 * that is left, drawn from the seeded generator so a mission can be replayed. If there is no room
 * before arrival it is dropped silently: a mission never gets an event it cannot reach.
 */
function followUpFor(
  state: SimState, eventId: string, optionId: string, decisionDay: number, clockDay: number, rngState: number,
): { upcoming: ScheduledEvent[]; state: number } {
  const caused = EVENT_DEFS.filter((e) => e.follows && e.follows.eventId === eventId && e.follows.optionId === optionId);
  if (caused.length === 0) return { upcoming: state.upcoming, state: rngState };
  const upcoming = [...state.upcoming];
  let next = rngState;
  for (const def of caused) {
    if (def.onlyIf && !state.config.flags.includes(def.onlyIf)) continue;
    const already = upcoming.findIndex((u) => u.eventId === def.id);
    if (already >= 0) {
      // a scripted run (demo mode) can already hold this card: it still learns what caused it
      if (upcoming[already].causedOnDay === undefined) upcoming[already] = { ...upcoming[already], causedOnDay: decisionDay };
      continue;
    }
    const roll = nextRandom(next);
    next = roll.state;
    // the follow-up is placed from the clock as it stands now, but it was caused on the day of the decision
    const left = state.totalDays - clockDay;
    const day = Math.round((clockDay + left * (0.2 + 0.4 * roll.value)) * 100) / 100;
    if (!(left > 0) || day >= state.totalDays) continue; // no room left before arrival
    upcoming.push({ day, eventId: def.id, causedOnDay: decisionDay });
  }
  upcoming.sort((a, b) => a.day - b.day);
  return { upcoming, state: next };
}

/** How risky this mission has been so far, in one word. */
export function riskLabel(riskTaken: number): "Low" | "Medium" | "High" | "Very high" {
  if (riskTaken < 0.15) return "Low";
  if (riskTaken < 0.35) return "Medium";
  if (riskTaken < 0.6) return "High";
  return "Very high";
}

/**
 * The option mission control picks when the player does not answer in time: never one that
 * makes the braking burn impossible, never a gamble if there is an alternative, then the
 * smallest penalty. Ties go to the option marked `safe` in the data.
 */
export function safestOption(ev: SimEvent): EventOption {
  const score = (o: EventOption) =>
    (o.warning ? 10 : 0) +
    (o.effect.riskOfFailure ?? 0) * 3 + (o.effect.riskAtInsertion ?? 0) * 3 +
    (o.effect.sciencePenalty ?? 0) + (o.effect.powerPenalty ?? 0) + (o.effect.signalPenalty ?? 0) -
    (o.safe ? 0.001 : 0);
  return ev.options.reduce((best, o) => (score(o) < score(best) ? o : best), ev.options[0]);
}

/**
 * Seeded random numbers (mulberry32) in pure form: same state in, same number out.
 * Returns a value in [0, 1) and the next state.
 */
export function nextRandom(state: number): { value: number; state: number } {
  const next = (state + 0x6d2b79f5) | 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), 1 | t);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, state: next };
}

// ---------- Position, power and signal at a given day ----------

type Readings = Pick<SimState,
  "spacecraft" | "earthAngleRad" | "targetAngleRad" | "distanceFromEarthAU" | "distanceFromSunAU" |
  "powerW" | "signalStrength" | "signalDelayMinutes">;

function readings(c: SimConfig, day: number, totalDays: number, powerFactor: number, signalFactor: number): Readings {
  const fraction = totalDays > 0 ? day / totalDays : 1;
  const pos = transferPosition(fraction, c.departureRadiusAU, c.targetOrbitRadiusAU);
  const spacecraft = { radiusAU: pos.radiusAU, angleRad: normalise(departureAngle(c.launchMonth) + pos.angleRad) };
  const earthAngleRad = planetAngle("earth", day, c.launchMonth, c, totalDays);
  const targetAngleRad = planetAngle("target", day, c.launchMonth, c, totalDays);

  const earthCentred = c.centralBody === "earth";
  const distanceFromEarthAU = earthCentred
    ? pos.radiusAU
    : distanceBetween(spacecraft, { radiusAU: EARTH_ORBIT_AU, angleRad: earthAngleRad });
  const distanceFromSunAU = earthCentred ? EARTH_ORBIT_AU : pos.radiusAU;

  return {
    spacecraft,
    earthAngleRad,
    targetAngleRad,
    distanceFromEarthAU,
    distanceFromSunAU,
    powerW: powerMade(c.powerSource, distanceFromSunAU) * powerFactor,
    signalStrength: signalStrengthAt(distanceFromEarthAU) * signalFactor,
    signalDelayMinutes: signalDelayAt(distanceFromEarthAU),
  };
}

/**
 * Angle (radians, 0..2π) of Earth or the target on its orbit on a given mission day.
 * Earth sits at the departure angle on launch day. The target is placed so that it is exactly
 * 180° from the departure point on arrival day, which is where the transfer ellipse ends.
 * When Earth is the central body (Moon trips) its angle is 0.
 */
export function planetAngle(
  planet: Planet, missionDay: number, launchMonth: number,
  orbit: { centralBody: string; targetOrbitDays: number }, totalDays: number,
): number {
  const depart = departureAngle(launchMonth);
  if (planet === "earth") {
    return orbit.centralBody === "earth" ? 0 : normalise(depart + (TAU * missionDay) / EARTH_ORBIT_DAYS);
  }
  return normalise(depart + Math.PI - (TAU * (totalDays - missionDay)) / orbit.targetOrbitDays);
}

/**
 * Where Earth and the target have got to `extraDays` after the mission ended.
 *
 * The mission stops; the solar system does not. A spacecraft that reached orbit is carried round the
 * Sun by the planet it is going round, so the map needs only these two angles to keep turning honestly.
 * At extraDays = 0 these are exactly the angles the simulation ended on.
 */
export function coastAngles(
  sim: Pick<SimState, "config" | "missionDay" | "totalDays">, extraDays: number,
): { earthAngleRad: number; targetAngleRad: number } {
  const c = sim.config;
  const day = sim.missionDay + Math.max(0, extraDays);
  return {
    earthAngleRad: planetAngle("earth", day, c.launchMonth, c, sim.totalDays),
    targetAngleRad: planetAngle("target", day, c.launchMonth, c, sim.totalDays),
  };
}

/** Earth's angle on launch day. January = 0; the map's rotation is arbitrary, only differences matter. */
function departureAngle(launchMonth: number): number {
  return normalise((TAU * launchMonth) / 12);
}

/**
 * Position on a Hohmann-style half-ellipse from radius r1 (angle 0) to radius r2 (angle π),
 * at time fraction f in 0..1. Uses Kepler's equation, so the spacecraft really does move
 * fast near the inner body and slow near the outer one.
 */
export function transferPosition(fraction: number, r1: number, r2: number): { radiusAU: number; angleRad: number } {
  const f = Math.min(1, Math.max(0, fraction));
  const a = (r1 + r2) / 2;
  const e = Math.min(0.999, Math.abs(r2 - r1) / (r1 + r2));
  const outward = r2 >= r1;
  // outward trips start at the closest point of the ellipse (mean anomaly 0), inward trips at the farthest (π)
  const meanAnomaly = (outward ? 0 : Math.PI) + Math.PI * f;
  const E = solveKepler(meanAnomaly, e);
  const trueAnomaly = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
  return { radiusAU: a * (1 - e * Math.cos(E)), angleRad: normalise(trueAnomaly - (outward ? 0 : Math.PI)) };
}

/** The whole transfer path as `points` positions, departure rotation applied. For drawing the trail. */
export function transferPath(c: Pick<SimConfig, "launchMonth" | "departureRadiusAU" | "targetOrbitRadiusAU">, points = 200): { radiusAU: number; angleRad: number }[] {
  const depart = departureAngle(c.launchMonth);
  return Array.from({ length: points }, (_, i) => {
    const p = transferPosition(i / (points - 1), c.departureRadiusAU, c.targetOrbitRadiusAU);
    return { radiusAU: p.radiusAU, angleRad: normalise(depart + p.angleRad) };
  });
}

/** Solve Kepler's equation E − e·sin(E) = M for E, by bisection (always converges). */
function solveKepler(M: number, e: number): number {
  let lo = 0, hi = TAU;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (mid - e * Math.sin(mid) < M) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

function distanceBetween(p: { radiusAU: number; angleRad: number }, q: { radiusAU: number; angleRad: number }): number {
  const d2 = p.radiusAU ** 2 + q.radiusAU ** 2 - 2 * p.radiusAU * q.radiusAU * Math.cos(p.angleRad - q.angleRad);
  return Math.sqrt(Math.max(0, d2));
}

function normalise(angle: number): number {
  return ((angle % TAU) + TAU) % TAU;
}

// ---------- Signal ----------

/** Radio signal weakens with the square of the distance: 1 next to Earth, 1/4 at 1 AU. */
export function signalStrengthAt(distanceFromEarthAU: number): number {
  return 1 / (1 + Math.max(0, distanceFromEarthAU)) ** 2;
}

/** One-way light time to Earth in minutes (the Moon is about 1.3 seconds). */
export function signalDelayAt(distanceFromEarthAU: number): number {
  return Math.max(0, distanceFromEarthAU) * LIGHT_MINUTES_PER_AU;
}


// ---------- Time scale ----------

/** Friendly speeds the clock can run at, in days per real second. */
const SCALES: { days: number; label: string }[] = [
  ...[10, 15, 20, 30, 45].map((m) => ({ days: m / 1440, label: `${m} minutes` })),
  { days: 1 / 24, label: "1 hour" },
  { days: 1.5 / 24, label: "90 minutes" },
  ...[2, 3, 4, 6, 8, 12].map((h) => ({ days: h / 24, label: `${h} hours` })),
  { days: 1, label: "1 day" },
  ...[2, 3, 4, 5, 6].map((d) => ({ days: d, label: `${d} days` })),
  { days: 7, label: "1 week" },
  { days: 14, label: "2 weeks" },
  { days: 21, label: "3 weeks" },
  { days: 30.44, label: "1 month" },
  ...[2, 3, 4, 6].map((m) => ({ days: m * 30.44, label: `${m} months` })),
  { days: 365.25, label: "1 year" },
];

/**
 * Pick the clock speed so the whole cruise takes about CRUISE_SECONDS real seconds,
 * snapped to a speed people can read ("1 sec = 4 days"). The label is exact, so the
 * real time varies a little: roughly 60–90 seconds for every scenario and route.
 */
export function timeScale(totalDays: number): { daysPerSecond: number; label: string; seconds: number } {
  const ideal = Math.max(totalDays, 1e-9) / CRUISE_SECONDS;
  let best = SCALES[0];
  for (const s of SCALES) {
    if (Math.abs(Math.log(s.days / ideal)) < Math.abs(Math.log(best.days / ideal))) best = s;
  }
  return { daysPerSecond: best.days, label: `1 sec = ${best.label}`, seconds: totalDays / best.days };
}
