/**
 * The three things that decide how hard a mission is, worked out from the scenario (Stage 10 Part 3).
 *
 * Sunlight decides whether solar panels are enough. Signal delay decides how alone the spacecraft is.
 * The launch window decides whether you can leave when you like. None of these are typed out by hand:
 * they come from the same real formulas the rest of the game uses, so a new scenario needs no new text.
 */
import type { CheckResult, Design, Scenario } from "./checks";
import { getAntenna, getEngine } from "./checks";
import { LIGHT_MINUTES_PER_AU, formatSignalDelay } from "./comms";
import { solarPowerAt } from "./power";

/** Green for the easy end, amber in the middle, red for the hard end. The same chips as a challenge card. */
export type Difficulty = "gain" | "risk" | "loss";
export interface MissionChip { id: "sunlight" | "signal" | "window"; label: string; tone: Difficulty; help: string }

/** Sunlight at the target as a share of what Earth gets, from the inverse-square rule. */
export function sunlightFraction(scenario: Scenario): number {
  return solarPowerAt(1, scenario.distanceAU);
}

/**
 * One-way signal delay to the target.
 * The Moon is an Earth-centred trip, so its orbit radius is its distance from Earth (about 1.3 light
 * seconds). For the planets the orbit radius stands in for the distance the signal has to cross.
 */
export function signalDelayMinutes(scenario: Scenario): number {
  return scenario.targetOrbitRadiusAU * LIGHT_MINUTES_PER_AU;
}

const percent = (fraction: number) => {
  const pct = fraction * 100;
  return pct >= 10 ? `${Math.round(pct)}%` : `${pct.toFixed(1)}%`;
};

/** The three chips for one mission, in the order a player needs them. */
export function missionChips(scenario: Scenario): MissionChip[] {
  const sun = sunlightFraction(scenario);
  const delay = signalDelayMinutes(scenario);
  const months = scenario.windowMonths;
  return [
    {
      id: "sunlight",
      label: `Sunlight: ${percent(sun)}`,
      tone: sun >= 0.8 ? "gain" : sun >= 0.2 ? "risk" : "loss",
      help: "How much sunlight solar panels get at the target, next to what they get at Earth.",
    },
    {
      id: "signal",
      label: `Signal: ${formatSignalDelay(delay)}`,
      tone: delay < 1 ? "gain" : delay < 20 ? "risk" : "loss",
      help: "How long a message takes to reach the spacecraft. The spacecraft has to cope alone for that long.",
    },
    {
      id: "window",
      label: months === 0 ? "Launch: any month" : `Launch: every ${months} months`,
      tone: months === 0 ? "gain" : months <= 13 ? "risk" : "loss",
      help: "How often the target lines up with Earth. Miss it and you wait for the next one.",
    },
  ];
}

/** One line that says what the player built, for the screens they see after the Design Lab. */
export interface ShipPart { id: string; text: string; always?: boolean }

/**
 * The spacecraft in one line: where it is going, what moves it, what it carries, what talks home,
 * and how much fuel and speed it has left. `fuelKg` is passed in because it is the one part that
 * changes during the flight.
 */
export function shipLine(design: Design, scenario: Scenario, check: CheckResult, fuelKg: number): ShipPart[] {
  const instruments = design.instrumentIds.length;
  return [
    { id: "target", text: scenario.target, always: true },
    { id: "engine", text: getEngine(design.engineId).name, always: true },
    { id: "instruments", text: instruments === 1 ? "1 instrument" : `${instruments} instruments` },
    { id: "antenna", text: getAntenna(design.antennaId).name },
    { id: "fuel", text: `Fuel ${Math.round(fuelKg).toLocaleString()} kg` },
    { id: "dv", text: `Δv ${check.dvAvailableKmS.toFixed(1)} km/s` },
  ];
}
