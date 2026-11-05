import { useEffect, useMemo, useState } from "react";
import { useGame } from "../store/gameStore";
import { runChecks, findScenario } from "../physics/checks";
import { buildSummary, explainMission, fetchFlightDirector, type MissionSummary } from "../ai/flightDirector";
import { eventIcon } from "../sim/deltas";
import { affectsLabels, affectTone, eventContext, fillTarget } from "../sim/context";
import { ProvenanceNote } from "../components/Provenance";
import { TeamGoals } from "../components/TeamGoals";
import { ALL_GOALS_BONUS, evaluateGoals, say, teamBonus, TEAM_TEXT as T, type GoalResult } from "../sim/team";

/** Where the optional AI Flight Director server lives (see README). Unset → rule-based explanations only. */
const DIRECTOR_URL: string | undefined = import.meta.env.VITE_FLIGHT_DIRECTOR_URL || undefined;

export interface Director { text: string; source: "ai" | "rules" | "waiting" }
/** Team mode only: each role's goal after the flight and the points the team earned for them. */
export interface TeamReport { goals: GoalResult[]; bonus: number; allMet: boolean }

/**
 * Results screen: score and stars, the Flight Director, what happened on the way, and the real mission.
 * This container builds the mission report and fetches the AI explanation; ResultView draws it.
 */
export function Result() {
  const { design, scenarioId, launchMonth, route, plan, sim, team, reset, go } = useGame();
  const scenario = findScenario(scenarioId);
  const check = useMemo(() => runChecks(design, scenario, launchMonth, route, plan), [design, scenario, launchMonth, route, plan]);
  const summary = useMemo(
    () => buildSummary(sim, design, scenario, launchMonth, route, check),
    [sim, design, scenario, launchMonth, route, check],
  );
  const teamReport = useMemo<TeamReport | undefined>(() => {
    if (!team) return undefined;
    const goals = evaluateGoals(team, scenario.id, check, summary.score.science);
    return { goals, ...teamBonus(goals) };
  }, [team, scenario.id, check, summary]);
  const [director, setDirector] = useState<Director>(() =>
    DIRECTOR_URL ? { text: "", source: "waiting" } : { text: explainMission(summary), source: "rules" },
  );

  useEffect(() => {
    if (!DIRECTOR_URL) {
      setDirector({ text: explainMission(summary), source: "rules" });
      return;
    }
    let alive = true;
    setDirector({ text: "", source: "waiting" });
    fetchFlightDirector(summary, DIRECTOR_URL).then((text) => {
      if (alive) setDirector(text ? { text, source: "ai" } : { text: explainMission(summary), source: "rules" });
    });
    return () => {
      alive = false;
    };
  }, [summary]);

  return <ResultView summary={summary} director={director} team={teamReport} onImprove={() => go("design")} onNew={reset} />;
}

/**
 * Everything on the results screen, drawn from the mission report.
 * Two columns on a laptop: the score, stars and the Flight Director on the left; what happened on the way
 * and the real missions on the right. Each decision shows what it cost (the same chips as the challenge
 * card) and the one-line real story behind the challenge.
 */
export function ResultView({ summary, director, team, onImprove, onNew }: {
  summary: MissionSummary; director: Director; team?: TeamReport; onImprove: () => void; onNew: () => void;
}) {
  const s = summary.score;
  const target = summary.scenario.target;
  const heading = s.reached
    ? `Mission reached ${target}! 🎉`
    : summary.flight.flown ? `Mission to ${target} failed` : `Design check for ${target}`;
  const stars: [boolean, string][] = [
    [s.stars.reached, "Reached the target"],
    [s.stars.fullSuccess, "Full success"],
    [s.stars.underBudget, "Under budget"],
  ];
  const sourceNote = director.source === "ai" ? "AI" : director.source === "rules" ? "mission rules" : "";
  const decisions = summary.flight.decisions;

  return (
    <div className="result">
      <div className="row between result-head">
        <h2>{heading}</h2>
        <div className="row">
          <button className="primary" onClick={onImprove}>Improve this design</button>
          <button onClick={onNew}>New mission</button>
        </div>
      </div>

      <div className="result-grid">
        <div className="result-left">
          <div className="stars-row" role="group" aria-label={`${s.starCount} of 3 stars`}>
            {stars.map(([on, label]) => (
              <span key={label} className={"star " + (on ? "on" : "off")}>{`${on ? "⭐" : "☆"} ${label}`}</span>
            ))}
          </div>
          {summary.plan && <p className="plan-line muted">{`${summary.plan.goalIcon} Goal: ${summary.plan.goal} · ${summary.plan.orbitIcon} Orbit: ${summary.plan.orbit} (${summary.plan.fitWord.toLowerCase()})`}</p>}
          <p className="lead">
            {`Score ${s.score}: ${s.science} science × ${Math.round(s.successFraction * 100)}% success + $${Math.round(s.moneyLeft)}M saved`}
          </p>

          {team && (
            <section className="team-result">
              <h3>{T.resultTitle}</h3>
              <p className="lead">{say(T.teamScore, { total: s.score + team.bonus, score: s.score, bonus: team.bonus })}</p>
              {team.allMet && <p className="ok-box">{say(T.allMet, { bonus: ALL_GOALS_BONUS })}</p>}
              <TeamGoals goals={team.goals} hint={false} />
            </section>
          )}

          <section className="director">
            <Avatar />
            <div className="bubble">
              <div className="bubble-head">
                Flight Director {sourceNote && <span className="muted small">{`· ${sourceNote}`}</span>}
              </div>
              <p>{director.source === "waiting" ? "The Flight Director is thinking…" : director.text}</p>
            </div>
          </section>
        </div>

        <div className="result-right">
          {decisions.length > 0 && (
            <section className="summary left">
              <h3>What happened on the way</h3>
              <ul className="decisions">
                {decisions.map((d, i) => {
                  const story = eventContext(d.eventId)?.realExample;
                  const verdict = d.gain ? "you won something" : d.hurt ? "this cost you something" : "no lasting harm";
                  return (
                    <li key={i} className={d.gain ? "won" : ""}>
                      <span className="verdict" role="img" aria-label={verdict}>{d.gain ? "➕" : d.hurt ? "⚠️" : "✅"}</span>
                      <b>{`${eventIcon(d.eventId)} Day ${d.day}: ${d.event}`}</b>
                      <br />
                      {`${d.option}. ${d.outcome}`}
                      <span className="affects">
                        {affectsLabels(d.effect).map((l) => {
                          const label = fillTarget(l, target);
                          return <span key={label} className={"affect " + affectTone(label)}>{label}</span>;
                        })}
                      </span>
                      {story && <span className="story muted small">{`Real story: ${story}`}</span>}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <section className="summary left">
            <h3>Compare with the real mission</h3>
            {summary.realMissions.map((m) => (
              <div key={m.id} className="real">
                <b>{m.name}</b> <span className="muted">{`${m.agency}, ${m.year}`}</span>
                <p>{m.fact}</p>
                <p className="compare">{m.comparison}</p>
              </div>
            ))}
          </section>
        </div>
      </div>
      <ProvenanceNote />
    </div>
  );
}

/** A simple flight director face with a headset. Inline SVG, no external images. */
function Avatar() {
  return (
    <svg className="avatar" viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="34" r="20" fill="#f1c9a5" />
      <path d="M14 30 a18 18 0 0 1 36 0 L50 34 Q32 22 14 34 Z" fill="#2b3a67" />
      <circle cx="25" cy="36" r="2.5" fill="#1b1b2f" />
      <circle cx="39" cy="36" r="2.5" fill="#1b1b2f" />
      <path d="M25 43 q7 6 14 0" stroke="#1b1b2f" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M12 34 a20 20 0 0 1 40 0" stroke="#4f8cff" strokeWidth="3" fill="none" />
      <rect x="9" y="32" width="6" height="11" rx="3" fill="#4f8cff" />
      <rect x="49" y="32" width="6" height="11" rx="3" fill="#4f8cff" />
      <path d="M15 43 q0 9 11 9" stroke="#4f8cff" strokeWidth="2" fill="none" />
      <circle cx="27" cy="52" r="2.5" fill="#4f8cff" />
    </svg>
  );
}
