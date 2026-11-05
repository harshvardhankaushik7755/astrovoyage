/**
 * Scoring (GDD Section 8). Pure functions, no React.
 *
 *   score = science collected × mission success fraction + money left ($M)
 *
 * Stars: reached the target · full success (no failure and at least 90% of the science) · under budget.
 * Without a flown mission (the results screen opened straight from the design), a design that
 * passes every check counts as reached, so the screen still makes sense.
 */
import type { CheckResult } from "../physics/checks";
import type { Decision, SimState } from "./simulation";

export interface Score {
  flown: boolean;
  reached: boolean;
  science: number;
  scienceMax: number;
  successFraction: number; // 1 when the spacecraft made it into orbit, else 0
  moneyLeft: number;
  score: number;
  stars: { reached: boolean; fullSuccess: boolean; underBudget: boolean };
  starCount: number;
}

export function scoreMission(sim: SimState | null, check: CheckResult): Score {
  const flown = sim !== null;
  const reached = flown ? sim.phase === "orbit" : check.allOk;
  const scienceMax = check.science;
  const science = flown ? sim.scienceCollected : check.allOk ? check.science : 0;
  const successFraction = reached ? 1 : 0;
  const moneyLeft = Math.max(0, check.budget.limit - check.budget.value);
  const score = Math.round(science * successFraction + moneyLeft);
  const stars = {
    reached,
    fullSuccess: reached && science >= 0.9 * scienceMax,
    underBudget: check.budget.ok && moneyLeft > 0,
  };
  const starCount = Object.values(stars).filter(Boolean).length;
  return { flown, reached, science, scienceMax, successFraction, moneyLeft, score, stars, starCount };
}

/** ✅ when the decision cost nothing lasting, ⚠️ when it cost science, power or signal, or took a risk. */
export function decisionVerdict(d: Decision): "ok" | "warn" {
  return d.hurt ? "warn" : "ok";
}
