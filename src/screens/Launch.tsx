import realMissions from "../data/realMissions.json";
import { useGame } from "../store/gameStore";
import { runChecks, findScenario } from "../physics/checks";
import type { KeyboardEvent } from "react";
import { windowMonthsList, ROUTE, routeDescription } from "../physics/windows";
import { MuteButton } from "../components/MuteButton";
import { ProvenanceNote } from "../components/Provenance";
import { MissionSummary } from "../components/MissionSummary";
import { launchWhoosh } from "../sound/sound";
import { isDemo } from "../sim/demo";
import { OwnerBadge, TeamGoals } from "../components/TeamGoals";
import { everyoneAgreed, evaluateGoals, ownerOf, say, TEAM_TEXT as T } from "../sim/team";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const START_YEAR = 2027;
const TOTAL = 36; // a 3-year calendar

/** Launch: the calendar and the route side by side, the final checks and the Launch button below, one screen. */
export function Launch() {
  const { design, scenarioId, launchMonth, route, plan, muted, team, signoffs, setLaunchMonth, setRoute, startMission, toggleSignoff, go } = useGame();
  const scenario = findScenario(scenarioId);
  const r = runChecks(design, scenario, launchMonth, route, plan);
  // in team mode the rocket only goes when every player has said "go" to this exact plan
  const agreed = !team || everyoneAgreed(team, signoffs);
  const waitingFor = team ? team.filter((p) => !signoffs.includes(p.id)).map((p) => p.name) : [];
  const launchOwner = team ? ownerOf(team, "launch") : null;
  const green = new Set(windowMonthsList(scenario.windowMonths, scenario.windowOffset, TOTAL));
  // arrow keys move through the months, so the calendar is one tab stop instead of 36
  const moveMonth = (e: KeyboardEvent<HTMLDivElement>) => {
    const delta = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : e.key === "ArrowDown" ? 12 : e.key === "ArrowUp" ? -12 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = Math.max(0, Math.min(TOTAL - 1, launchMonth + delta));
    setLaunchMonth(next);
    e.currentTarget.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
  };

  return (
    <div className="launch">
      <div className="row between launch-bar">
        <h2>Launch — {scenario.name}</h2>
        <MissionSummary design={design} scenario={scenario} check={r} fuelKg={design.fuelKg} onEdit={() => go("design")} />
        <button onClick={() => go("design")}>← Back to Design Lab</button>
      </div>

      <div className="launch-top">
        <section>
          <h4>Pick a launch month <span className="muted">(✓ = launch window open)</span>
            {launchOwner && <> <OwnerBadge name={launchOwner.player.name} roleId={launchOwner.roleId} /></>}</h4>
          <div className="calendar" role="group" aria-label="Launch month. Use the arrow keys to move between months." onKeyDown={moveMonth}>
            {Array.from({ length: TOTAL }, (_, m) => (
              <button key={m} className={"month " + (green.has(m) ? "green " : "") + (m === launchMonth ? "picked" : "")} tabIndex={m === launchMonth ? 0 : -1}
                aria-pressed={m === launchMonth} aria-label={`${MONTHS[m % 12]} ${START_YEAR + Math.floor(m / 12)}${green.has(m) ? ", launch window open" : ""}`}
                onClick={() => setLaunchMonth(m)}>
                {MONTHS[m % 12]}{green.has(m) ? " ✓" : ""}<br /><small>{START_YEAR + Math.floor(m / 12)}</small>
              </button>
            ))}
          </div>
          <p className={"window-msg " + r.window.status}>{r.window.message}</p>
        </section>

        <section>
          <h4>Pick a route</h4>
          {(["fast", "slow"] as const).map((k) => (
            <label key={k} className={"item " + (route === k ? "on" : "")}>
              <input type="radio" name="route" checked={route === k} onChange={() => setRoute(k)} />
              <span><b>{ROUTE[k].label}</b> <span className="muted">{`— ${routeDescription(k)}`}</span></span>
            </label>
          ))}
        </section>
      </div>

      <section className="summary launch-checks">
        <div className="checks-grid">
          <div>
            <h3>Final checks</h3>
            <ul className="checks">
              <Check ok={r.mass.ok} text={`Fits the rocket: ${r.mass.value} kg of ${r.mass.limit} kg`} />
              <Check ok={r.dv.ok} text={`Enough fuel: can do ${r.dv.limit} km/s, trip needs ${r.dv.value} km/s`} />
              <Check ok={r.power.ok} text={`Enough power at target: makes ${r.power.limit} W, needs ${r.power.value} W`} />
              <Check ok={r.window.status !== "closed"} text={`Launch date: ${r.window.message}`} />
              <Check ok={r.comms.ok} text={`Data home: ${Math.round(r.comms.fraction * 100)}% of science reaches Earth`} />
            </ul>
          </div>
          <div className="launch-go">
            <p><b>Trip time:</b> about {r.tripDays < 60 ? r.tripDays + " days" : Math.round(r.tripDays / 30) + " months"}<br />
              <b>Science:</b> {r.science} pts<br /><b>Money left:</b> ${(r.budget.limit - r.budget.value).toFixed(1)}M</p>
            {team && r.allOk && (
              <div className="signoff" role="group" aria-label={T.signoffTitle}>
                <div className="row">
                  {team.map((p) => {
                    const on = signoffs.includes(p.id);
                    return (
                      <button key={p.id} className={on ? "signed" : ""} aria-pressed={on} onClick={() => toggleSignoff(p.id)}>
                        {say(on ? T.signedButton : T.signoffButton, { name: p.name })}
                      </button>
                    );
                  })}
                </div>
                <span className="small">{agreed ? <span className="muted">{T.signoffHint}</span>
                  : <><b>{T.signoffTitle}</b> <span className="muted">{say(T.waiting, { names: waitingFor.join(", ") })}</span></>}</span>
              </div>
            )}
            <button className="primary big" data-sound="none" disabled={!r.allOk || !agreed} onClick={() => { launchWhoosh(muted); startMission(isDemo()); }}>Launch! 🚀</button>
            <MuteButton />
          </div>
        </div>
        {team && (
          <TeamGoals goals={evaluateGoals(team, scenario.id, r)} compact hint={false} />
        )}
        <ProvenanceNote />
      </section>

      <details className="learn-more">
        <summary>Learn more: real missions to compare</summary>
        {scenario.realMissionIds.map((id) => {
          const m = realMissions.find((x) => x.id === id)!;
          return <p key={id}><b>{m.name}</b> ({m.agency}, {m.year}): {m.fact}</p>;
        })}
      </details>
    </div>
  );
}

function Check({ ok, text }: { ok: boolean; text: string }) {
  return <li className={ok ? "pass" : "fail"}>{ok ? "✅" : "❌"} {text}</li>;
}
