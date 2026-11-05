/**
 * Real-world context for challenges (Stage 8): what an event is, a real story, how common it is,
 * and the plain-language "affects" labels for every option. The labels are generated from the
 * effect object here, and a data test checks that `affects` in events.json says exactly the same,
 * so the card can never promise something the engine does not do.
 */
import { EVENT_DEFS, type EventEffect } from "./simulation";
import type { ShipPart } from "./shipLayout";

export type AffectTone = "gain" | "loss" | "risk" | "time";
export interface EventContext { whatIsIt: string; realExample: string; howCommon: string; verify: boolean }

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** A short note for options where a protection removed the cost, keyed by the design flag that protects. */
export function protectionNote(protectedBy: string | undefined): string {
  switch (protectedBy) {
    case "backup": return "backup systems handle it";
    case "antLarge": return "the big dish handles it";
    case "rtg": return "the nuclear battery handles it";
    case "threeInstruments": return "a backup instrument takes over";
    default: return "your design handles it";
  }
}

/** The gauges an option touches, as labels a 12-year-old can read. {target} is filled in by the screen. */
export function affectsLabels(effect: EventEffect, protectedNote?: string): string[] {
  const out: string[] = [];
  // what the choice wins first, then what it costs
  if (effect.scienceBonus) out.push(`Science +${pct(effect.scienceBonus)}`);
  if (effect.fuelSaved) out.push(`Fuel saved: ${effect.fuelSaved} kg`);
  if (effect.clearInsertionRisk) out.push("Fixes the aim: no chance of missing {target}");
  if (effect.fuelCost) out.push(`Fuel −${effect.fuelCost} kg`);
  if (effect.sciencePenalty) out.push(`Science −${pct(effect.sciencePenalty)}`);
  if (effect.powerPenalty) out.push(`Power −${pct(effect.powerPenalty)} for the rest of the trip`);
  if (effect.signalPenalty) {
    out.push(`Signal −${pct(effect.signalPenalty)} for the rest of the trip`);
    // a weaker signal sends less data home, so the science score drops by the same share
    out.push(`Science −${pct(effect.signalPenalty)} (less data reaches Earth)`);
  }
  if (effect.daysLost) out.push(`+${effect.daysLost} ${effect.daysLost === 1 ? "day" : "days"}`);
  if (effect.riskAtInsertion) out.push(`${Math.round(effect.riskAtInsertion * 10)} in 10 chance of missing {target}`);
  if (effect.riskOfFailure) out.push(`1 in ${Math.round(1 / effect.riskOfFailure)} chance of losing the spacecraft`);
  if (out.length === 0) out.push(protectedNote ? `No cost — ${protectedNote}` : "No cost");
  return out;
}

/** Everything that is good news for the mission, so one rule decides the colour. */
const GOOD = [/^No cost/, /^Science \+/, /^Fuel saved/, /^Fixes the aim/];

/** Colour family for a label: green for good news, blue for time, amber for a chance, red for a loss. */
export function affectTone(label: string): AffectTone {
  if (GOOD.some((re) => re.test(label))) return "gain";
  if (label.startsWith("+") && label.includes("day")) return "time";
  if (label.includes("chance of")) return "risk";
  return "loss";
}

/** What the event is, a real story with a year, and how common it is. */
export function eventContext(eventId: string): EventContext | null {
  const def = EVENT_DEFS.find((e) => e.id === eventId);
  if (!def) return null;
  return { whatIsIt: def.whatIsIt ?? "", realExample: def.realExample ?? "", howCommon: def.howCommon ?? "", verify: def.verify === true };
}

/** Fill {target} in a label. */
export const fillTarget = (text: string, target: string) => text.replace(/\{target\}/g, target);

/**
 * Stage 12: what a challenge does to the machine.
 *
 * `affectsPart` in events.json says which part of the spacecraft an event happens to. These two
 * say what that looks like, and which part a single option would touch — so hovering an option can
 * point at the thing it changes.
 */
export type Damage = "dust" | "dent" | "dark" | "turned";

/** One look per event: how the part it hits is drawn while the card is open. */
const DAMAGE: Record<string, Damage> = {
  dust: "dust",                 // a coat of dust dulls the panels
  debrisDamage: "dent",         // a piece of debris punched a hole in a panel
  micrometeoroid: "dent",       // a grain of dust at bullet speed chipped an instrument
  instrumentFault: "dark",      // an instrument that has stopped working
  lostSignal: "turned",         // the dish is pointing the wrong way
  solarStorm: "dark",           // charged particles, and electronics that may not survive them
  radiationBelt: "dark",
  safeMode: "dark",             // the spacecraft shut itself down and is waiting
  softwareBug: "dark",
};

/** How the affected part should look while this challenge is on screen, or null for no damage. */
export function damageFor(eventId: string): Damage | null {
  return DAMAGE[eventId] ?? null;
}

/**
 * The part one option would touch, so the schematic can point at it while that option is in hand.
 * An option that only takes a risk or costs days is about the whole mission, so it falls back to
 * the part the event itself is happening to.
 */
export function optionPart(effect: EventEffect, fallback: ShipPart | null): ShipPart | null {
  if (effect.powerPenalty) return "power";
  if (effect.signalPenalty) return "antenna";
  if (effect.sciencePenalty || effect.scienceBonus) return "instruments";
  if (effect.fuelCost || effect.fuelSaved) return "engine";
  return fallback;
}

/**
 * The two-second beat that plays over the map when a challenge arrives, before the card opens.
 *
 * One beat per event, and a sensible default for anything not named here. It is a moment of theatre,
 * never a gate: it can be skipped by a click or Escape, it is switched off entirely for a player who
 * asked for less motion, and the mission clock is stopped by the engine either way, so skipping it
 * costs nothing and waiting through it costs nothing.
 */
export type Beat = "dust" | "rock" | "dish" | "flare" | "blink" | "light" | "chance" | "alert";

const BEATS: Record<string, Beat> = {
  dust: "dust",                    // dust rolls across the panels
  debris: "rock",                  // a rock tumbles past
  micrometeoroid: "rock",
  debrisDamage: "rock",
  lostSignal: "dish",              // the dish swings away and the line to Earth breaks
  groundStationBusy: "dish",
  solarStorm: "flare",             // the Sun flares
  radiationBelt: "flare",
  instrumentFault: "blink",        // something on board stops answering
  safeMode: "blink",
  softwareBug: "blink",
  sunPush: "light",                // sunlight leaning on the panels
  gravityAssist: "chance",         // an opportunity arrives, and it looks like one
  bonusTarget: "chance",
  extraData: "chance",
};

/** Which beat plays for a challenge. Anything with no beat of its own gets the plain alert ring. */
export function beatFor(eventId: string): Beat {
  return BEATS[eventId] ?? "alert";
}
