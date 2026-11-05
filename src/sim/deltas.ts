/**
 * What a decision did, in gauge terms. Pure helpers for the Mission Control effects and the results list.
 * Everything comes from the `effect` the engine recorded on each decision.
 */
import type { Decision } from "./simulation";

export type GaugeId = "fuel" | "power" | "signal" | "science" | "clock" | "arrival";
export interface Delta { gauge: GaugeId; label: string; tone: "loss" | "gain" | "risk" }
export interface Mark { gauge: GaugeId; icon: string; text: string; sentence: string; day: number }

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** One icon per challenge, used on the map trail, the gauges and the results list. */
export function eventIcon(eventId: string): string {
  switch (eventId) {
    case "solarStorm": return "🌞";
    case "dust": return "🌫️";
    case "courseDrift": return "🧭";
    case "lostSignal": return "📡";
    case "instrumentFault": return "🔧";
    case "debris": return "🛰️";
    case "debrisDamage": return "🔩";
    case "micrometeoroid": return "☄️";
    case "sunPush": return "⛵";
    case "planetaryProtection": return "🦠";
    case "gravityAssist": return "🪐";
    case "assistCheck": return "🎯";
    case "bonusTarget": return "🔭";
    case "extraData": return "📈";
    case "safeMode": return "😴";
    case "groundStationBusy": return "📻";
    case "softwareBug": return "🐛";
    case "radiationBelt": return "☢️";
    default: return "•";
  }
}

/** The gauge a challenge is mostly about, for a "no harm done" note. */
function homeGauge(eventId: string): GaugeId {
  switch (eventId) {
    case "dust": return "power";
    case "lostSignal": return "signal";
    case "courseDrift": return "arrival";
    default: return "science";
  }
}

/** The floating labels to show the moment a decision is made, e.g. "−30% power", "+7 days". */
export function decisionDeltas(d: Decision): Delta[] {
  const e = d.effect;
  const out: Delta[] = [];
  if (e.fuelCost) out.push({ gauge: "fuel", label: `−${e.fuelCost} kg fuel`, tone: "loss" });
  if (e.powerPenalty) out.push({ gauge: "power", label: `−${pct(e.powerPenalty)} power`, tone: "loss" });
  if (e.signalPenalty) out.push({ gauge: "signal", label: `−${pct(e.signalPenalty)} signal`, tone: "loss" });
  if (e.sciencePenalty) out.push({ gauge: "science", label: `−${pct(e.sciencePenalty)} science`, tone: "loss" });
  if (e.daysLost) out.push({ gauge: "clock", label: `+${e.daysLost} ${e.daysLost === 1 ? "day" : "days"}`, tone: "loss" });
  if (e.riskAtInsertion) out.push({ gauge: "arrival", label: `${Math.round(e.riskAtInsertion * 10)} in 10 chance of missing`, tone: "risk" });
  if (e.riskOfFailure) out.push({ gauge: "science", label: "risk taken", tone: "risk" });
  if (out.length === 0) out.push({ gauge: homeGauge(d.eventId), label: "no harm done", tone: "gain" });
  return out;
}

/** The marks that stay on the gauges for the rest of the trip, one per lasting effect. */
export function gaugeMarks(decisions: Decision[]): Mark[] {
  const marks: Mark[] = [];
  for (const d of decisions) {
    const e = d.effect;
    const icon = eventIcon(d.eventId);
    const sentence = `${d.option}. ${d.outcome}`;
    if (e.powerPenalty) marks.push({ gauge: "power", icon, text: `−${pct(e.powerPenalty)} since day ${d.day}`, sentence, day: d.day });
    if (e.signalPenalty) marks.push({ gauge: "signal", icon, text: `−${pct(e.signalPenalty)} since day ${d.day}`, sentence, day: d.day });
    if (e.sciencePenalty) marks.push({ gauge: "science", icon, text: `−${pct(e.sciencePenalty)} on day ${d.day}`, sentence, day: d.day });
    if (e.fuelCost) marks.push({ gauge: "fuel", icon, text: `−${e.fuelCost} kg on day ${d.day}`, sentence, day: d.day });
    if (e.daysLost) marks.push({ gauge: "clock", icon, text: `+${e.daysLost} ${e.daysLost === 1 ? "day" : "days"} on day ${d.day}`, sentence, day: d.day });
    if (e.riskAtInsertion) marks.push({ gauge: "arrival", icon, text: `${Math.round(e.riskAtInsertion * 10)} in 10 chance of missing`, sentence, day: d.day });
  }
  return marks;
}

/** Short chips for the results list: "Power −30%", "Fuel −5 kg", "+7 days". */
export function deltaChips(d: Decision): string[] {
  const e = d.effect;
  const chips: string[] = [];
  if (e.fuelCost) chips.push(`Fuel −${e.fuelCost} kg`);
  if (e.powerPenalty) chips.push(`Power −${pct(e.powerPenalty)}`);
  if (e.signalPenalty) chips.push(`Signal −${pct(e.signalPenalty)}`);
  if (e.sciencePenalty) chips.push(`Science −${pct(e.sciencePenalty)}`);
  if (e.daysLost) chips.push(`+${e.daysLost} ${e.daysLost === 1 ? "day" : "days"}`);
  if (e.riskAtInsertion) chips.push(`${Math.round(e.riskAtInsertion * 10)} in 10 chance of missing`);
  if (e.riskOfFailure) chips.push(`${Math.round(e.riskOfFailure * 100)}% risk taken`);
  return chips;
}
