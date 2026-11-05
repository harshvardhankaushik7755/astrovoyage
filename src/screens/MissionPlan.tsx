import parts from "../data/parts.json";
import { useGame } from "../store/gameStore";
import { findScenario } from "../physics/checks";
import {
  findObjective, fitLevel, fitWord, insertionDeltaV, orbitFit, orbitLoop, plansFor, PLAN_TEXT as T,
  type OrbitOption,
} from "../physics/plan";
import { MuteButton } from "../components/MuteButton";

const say = (s: string, vars: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
const instrumentName = (id: string) => parts.instruments.find((p) => p.id === id)?.name ?? id;

/**
 * Mission plan (Stage 17): the player picks what the mission is for, then the orbit at the target.
 * The goal decides which instruments earn the most science; the orbit decides the braking burn (real
 * capture physics) and how well it suits the goal. Both are shown as plain words and numbers.
 */
export function MissionPlan() {
  const { scenarioId, plan, setObjective, setOrbit, go } = useGame();
  const scenario = findScenario(scenarioId);
  const options = plansFor(scenarioId);
  const objective = findObjective(scenarioId, plan.objectiveId);

  return (
    <div className="plan-screen">
      <div className="row between">
        <h2>{`${T.title} — ${scenario.name}`}</h2>
        <div className="row">
          <button onClick={() => go("choose")}>{T.back}</button>
          <MuteButton />
        </div>
      </div>

      <div className="plan-grid">
        <section>
          <h3>{T.goalStep}</h3>
          <div role="radiogroup" aria-label={T.goalStep} className="plan-list">
            {options.objectives.map((o) => (
              <label key={o.id} className={"item opt plan-card " + (o.id === objective.id ? "on" : "")}>
                <input className="sr-only" type="radio" name="objective" checked={o.id === objective.id} onChange={() => setObjective(o.id)} />
                <span className="plan-icon" aria-hidden="true">{o.icon}</span>
                <span className="opt-body">
                  <b>{o.name}</b>
                  <span className="muted">{o.short}</span>
                  <span className="opt-stats">
                    <span className="small">{T.bestTools}</span>
                    {o.key.map((id) => <span key={id} className="stat">{instrumentName(id)}</span>)}
                  </span>
                </span>
              </label>
            ))}
          </div>
          <div className="plan-why">
            <b>{T.changesTitle}</b>
            <ul>
              <li>{T.changesScience}</li>
              <li>{say(T.changesFuel, { target: scenario.targetProse })}</li>
            </ul>
          </div>
        </section>

        <section>
          <h3>{T.orbitStep}</h3>
          <p className="muted small">{say(T.orbitHelp, { target: scenario.targetProse })}</p>
          <div role="radiogroup" aria-label={T.orbitStep} className="plan-list">
            {options.orbits.map((o) => {
              const fit = orbitFit(objective, o.id);
              return (
                <label key={o.id} className={"item opt plan-card " + (o.id === plan.orbitId ? "on" : "")}>
                  <input className="sr-only" type="radio" name="orbit" checked={o.id === plan.orbitId} onChange={() => setOrbit(o.id)} />
                  <OrbitPicture orbit={o} color={scenario.color} />
                  <span className="opt-body">
                    <span><b>{o.name}</b> <span className="muted">{`· ${o.size}`}</span></span>
                    <span className="muted">{o.short}</span>
                    <span className="opt-stats">
                      <span className="stat">{`🔥 ${T.brake}: ${insertionDeltaV(scenarioId, o.id).toFixed(2)} km/s`}</span>
                      <span className="stat">{`🔄 ${T.loop}: ${orbitLoop(scenarioId, o.id)}`}</span>
                      <span className={"affect fit-" + fitLevel(fit)}>{fitWord(fit)}</span>
                    </span>
                    <small className="muted">{o.like}</small>
                  </span>
                </label>
              );
            })}
          </div>
        </section>
      </div>

      <div className="row plan-go">
        <button className="primary big" onClick={() => go("design")}>{T.next}</button>
      </div>
    </div>
  );
}

/**
 * The orbit's shape round the planet. The far side is squeezed on a log scale so a Juno-style loop that goes
 * 100 planet-widths out still fits next to a low circle; it shows the shape, not the true size.
 */
function OrbitPicture({ orbit, color }: { orbit: OrbitOption; color: string }) {
  const R = 6;
  const stretch = Math.log10(1 + orbit.apoapsisKm / Math.max(1, orbit.periapsisKm));
  const peri = R + 3;
  const apo = Math.min(80, peri + stretch * 20);
  const rx = (peri + apo) / 2;
  const ry = Math.min(23, Math.sqrt(peri * apo)); // semi-minor axis b = √(rp·ra)
  // the planet sits at one focus, (apo − peri) / 2 from the centre of the ellipse
  const planetX = 50 - (apo - peri) / 2;
  return (
    <svg className="orbit-pic" viewBox="0 0 100 50" aria-hidden="true">
      <ellipse cx={50} cy={25} rx={rx} ry={ry} className="orbit-pic-path" />
      <circle cx={planetX} cy={25} r={R} fill={color} />
      <circle cx={planetX - peri} cy={25} r={2.2} className="orbit-pic-ship" />
    </svg>
  );
}
