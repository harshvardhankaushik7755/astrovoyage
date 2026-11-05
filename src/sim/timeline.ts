/**
 * The four steps of a mission, read straight off the simulation (Stage 10 Part 5).
 *
 * The mission log already writes the milestones as sentences; this is the same thing at a glance, so a
 * player can see where they are without reading back through the log. It holds no state of its own:
 * every step is worked out from the phase and the clock, so it can never disagree with the mission.
 */
import type { SimState } from "./simulation";

export type StepState = "done" | "current" | "future" | "failed";
export interface MissionStep { id: string; label: string; state: StepState }

const STEPS = [
  { id: "launch", label: "Launch" },
  { id: "cruise", label: "Cruise" },
  { id: "burn", label: "Arrival burn" },
  { id: "orbit", label: "In orbit" },
];

/**
 * Which step the mission is on. Exactly one step is ever "current", and a lost spacecraft marks the
 * step it never finished rather than pretending the mission is still going.
 */
export function missionSteps(sim: SimState): MissionStep[] {
  const started = sim.missionDay > 0;
  const atEnd = sim.missionDay >= sim.totalDays;
  const at = (id: string): StepState => {
    switch (sim.phase) {
      case "cruise":
        if (id === "launch") return started ? "done" : "current";
        if (id === "cruise") return started ? "current" : "future";
        return "future";
      case "insertion":
        if (id === "launch" || id === "cruise") return "done";
        if (id === "burn") return "current";
        return "future";
      case "orbit":
      case "done":
        return "done";
      case "failed":
        // the spacecraft can be lost on the way as well as at the target
        if (id === "launch") return "done";
        if (id === "cruise") return atEnd ? "done" : "failed";
        if (id === "burn") return atEnd ? "failed" : "future";
        return "future";
    }
  };
  return STEPS.map((s) => {
    const state = at(s.id);
    return { id: s.id, label: state === "failed" ? "Lost" : s.label, state };
  });
}
