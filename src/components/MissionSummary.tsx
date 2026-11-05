import { shipLine } from "../physics/missionFacts";
import type { CheckResult, Design, Scenario } from "../physics/checks";

/**
 * The spacecraft the player built, in one line, so it stays with them after they leave the Design Lab
 * (Stage 10 Part 4). When a challenge costs 8 kg of fuel, this is what it is coming out of.
 *
 * The fuel figure is the live one while a mission is flying; everything else is fixed at launch.
 * Narrow screens keep only the target and the engine, so the line never wraps.
 */
export function MissionSummary({ design, scenario, check, fuelKg, fuelKey, onEdit }: {
  design: Design;
  scenario: Scenario;
  check: CheckResult;
  fuelKg: number;
  /** Changes when a challenge changed the fuel, which replays the highlight. */
  fuelKey?: string | number;
  /** Given only before launch: afterwards the design cannot be changed. */
  onEdit?: () => void;
}) {
  const parts = shipLine(design, scenario, check, fuelKg);
  return (
    <div className="ship-line" role="group" aria-label={`Your spacecraft: ${parts.map((p) => p.text).join(", ")}`}>
      {parts.map((p, i) => (
        // the fuel span is re-keyed when a challenge changes it, which replays the highlight
        <span key={p.id === "fuel" ? `fuel-${fuelKey ?? ""}` : p.id}
          className={(p.always ? "ship-part" : "ship-part extra") + (p.id === "fuel" ? " ship-fuel" : "") + (p.id === "fuel" && fuelKey ? " bump" : "")}>
          {i > 0 && <span className="sep" aria-hidden="true"> · </span>}
          {p.text}
        </span>
      ))}
      {onEdit && <button type="button" className="link ship-edit" onClick={onEdit}>Edit</button>}
    </div>
  );
}
