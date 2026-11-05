import { missionSteps } from "../sim/timeline";
import type { SimState } from "../sim/simulation";

/**
 * Launch ── Cruise ── Arrival burn ── In orbit, at a glance (Stage 10 Part 5).
 * Done steps carry a tick, the step the mission is on pulses, the ones still to come are grey,
 * and a lost spacecraft turns the step it never finished red and says so.
 */
export function Timeline({ sim }: { sim: SimState }) {
  const steps = missionSteps(sim);
  const now = steps.find((s) => s.state === "current" || s.state === "failed");
  return (
    <ol className="timeline" aria-label={`Mission progress: ${now ? now.label : steps[steps.length - 1].label}`}>
      {steps.map((s) => (
        <li key={s.id} className={"step " + s.state} aria-current={s.state === "current" ? "step" : undefined}>
          <span className="dot" aria-hidden="true">{s.state === "done" ? "✔" : s.state === "failed" ? "✖" : ""}</span>
          <span className="step-label">{s.label}</span>
        </li>
      ))}
    </ol>
  );
}
