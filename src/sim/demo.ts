/**
 * Demo mode: open the game with ?demo=1, press the one button on the home screen, and a Mars mission
 * starts at once with a fixed run of cards, so testers and judges see the whole game in about the first
 * 30 seconds of the cruise.
 *
 * Mars, not the Moon: every cruise takes 60–90 real seconds whatever the distance (the time-scale rule),
 * but a Moon trip is only four days long, so the three days the asteroid photograph costs would throw the
 * last cards on top of each other. On Mars the same three days are barely a nudge in a 336-day trip.
 *
 * The run is chosen to show one of each thing the game can do:
 *   debris        a problem near Earth, where the safe choice costs fuel
 *   bonusTarget   an OPPORTUNITY: a green card that pays science back
 *   extraData     the FOLLOW-UP the photograph causes, which names the choice it came from
 *   sunPush       sunlight as a real force, with three different prices to pay
 *   safeMode      the spacecraft switching itself off, softened by backup systems
 *
 */
import { EVENT_DEFS, type ScheduledEvent } from "./simulation";

export const DEMO_EVENTS = ["debris", "bonusTarget", "extraData", "sunPush", "safeMode"];

/** The scenario the demo button starts, chosen so a few days lost cannot bunch the cards up. */
export const DEMO_SCENARIO = "mars";
/** Where the first card falls, and how far apart the rest are, as a share of the trip. */
const FIRST = 0.04;
const APART = 0.08;

/**
 * Five cards between 4% and 36% of the trip, 8% apart. Eight percent of a Mars trip is about 27 days,
 * so even the choices that cost days leave a clear gap before the next card.
 */
export function demoSchedule(totalDays: number): ScheduledEvent[] {
  return DEMO_EVENTS.map((eventId, i) => ({ day: Math.round(totalDays * (FIRST + APART * i) * 100) / 100, eventId }));
}

/** True when the page was opened with ?demo=1. */
export function isDemo(search: string = typeof window === "undefined" ? "" : window.location.search): boolean {
  return new URLSearchParams(search).get("demo") === "1";
}

/** What the demo run shows, for the tests and for anyone editing DEMO_EVENTS. */
export function demoContents(): { opportunities: string[]; followUps: string[] } {
  const defs = DEMO_EVENTS.map((id) => EVENT_DEFS.find((e) => e.id === id)).filter((e) => e !== undefined);
  return {
    opportunities: defs.filter((e) => e.kind === "opportunity").map((e) => e.id),
    followUps: defs.filter((e) => e.follows).map((e) => e.id),
  };
}
