/**
 * What choosing a part DOES to this mission, in one plain sentence (Stage 10 Part 1).
 *
 * Every line is worked out from the same formulas the Mission check uses, against the scenario the
 * player is designing for and the rest of the design they have built, so the lines change live as
 * anything else changes. Nothing here is written into a data file: a sentence that disagreed with the
 * physics would teach the wrong thing.
 *
 * These are facts, never warnings. "Can lift 1500 kg into space" is the line whether or not the
 * spacecraft fits; the Mission check panel is the only place that says a choice is a problem.
 */
import parts from "../data/parts.json";
import scenarios from "../data/scenarios.json";
import type { Design, Scenario } from "./checks";
import { runChecks, getInstrument } from "./checks";
import { fuelNeeded } from "./rocketEquation";
import { powerMade } from "./power";
import { dataReturnedFraction } from "./comms";
import type { Route } from "./windows";
import type { Plan } from "./plan";

type Body = { slots: number; backup?: boolean };
type Instrument = { science: number; power: number };
type PowerSource = { type: string; powerAt1AU: number };
type Antenna = { id: string; dataRate: number };
type Engine = { id: string; isp: number; powerNeed: number };
type Rocket = { capacity: number };

const kg = (n: number) => `${Math.round(n).toLocaleString()} kg`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** How much the rocket can put into space. */
export function rocketEffect(rocket: Rocket): string {
  return `Can lift ${kg(rocket.capacity)} into space`;
}

/** How many instruments fit, and whether the bus carries the backup systems a solar storm can hit. */
export function bodyEffect(body: Body): string {
  const room = `Room for ${plural(body.slots, "instrument", "instruments")}`;
  return body.backup ? `${room}. Has backup systems: protects you from a solar storm` : room;
}

/** What one instrument adds, and what it costs to run. */
export function instrumentEffect(instrument: Instrument): string {
  return `Adds ${plural(instrument.science, "science point", "science points")}, needs ${instrument.power} W`;
}

/** What this power source really makes at the target: sunlight fades with distance, a nuclear battery does not. */
export function powerEffect(source: PowerSource, scenario: Scenario): string {
  if (source.type === "rtg") return `Makes ${Math.round(source.powerAt1AU)} W anywhere. Sunlight does not matter.`;
  return `Makes about ${Math.round(powerMade(source, scenario.distanceAU))} W at ${scenario.targetProse}`;
}

/**
 * How much of the science this antenna can actually send home from that far away.
 *
 * Close to Earth every antenna gets everything home, so the choice looks free and the group teaches
 * nothing. When two antennas really do read the same here, the line also says what the same antenna
 * would manage on the hardest mission in the game, which is where the choice starts to matter.
 */
export function antennaEffect(antenna: Antenna, design: Design, scenario: Scenario): string {
  const dataNeed = design.instrumentIds.reduce((sum, id) => sum + getInstrument(id).dataNeed, 0);
  const share = (commsFactor: number) => Math.round(dataReturnedFraction(antenna.dataRate, commsFactor, dataNeed) * 100);
  const here = share(scenario.commsFactor);
  const plain = `About ${here}% of your science reaches Earth`;

  const sameAsAnother = parts.antennas.some(
    (other) => other.id !== antenna.id && Math.round(dataReturnedFraction(other.dataRate, scenario.commsFactor, dataNeed) * 100) === here,
  );
  if (!sameAsAnother) return plain;

  // the hardest mission to talk home from: the one where the least signal survives the distance
  const hardest = (scenarios as Scenario[]).reduce((worst, s) => (s.commsFactor < worst.commsFactor ? s : worst));
  const there = share(hardest.commsFactor);
  if (hardest.id === scenario.id || there >= here) return plain;
  return `About ${here}% here — but only about ${there}% at ${hardest.targetProse}`;
}

/**
 * How much fuel this engine would need for this trip, at the mass the rest of the design comes to.
 * No travel time here: in this game the trip length comes from the scenario and the route, not the engine.
 */
export function engineEffect(engine: Engine, design: Design, scenario: Scenario, launchMonth: number, route: Route, plan?: Plan): string {
  const check = runChecks({ ...design, engineId: engine.id }, scenario, launchMonth, route, plan);
  const needed = fuelNeeded(engine.isp, check.dryMassKg, check.dvNeededKmS);
  const line = `Needs about ${kg(needed)} of fuel for this trip`;
  return engine.powerNeed > 0 ? `${line}, and ${engine.powerNeed} W of power the whole way` : line;
}

