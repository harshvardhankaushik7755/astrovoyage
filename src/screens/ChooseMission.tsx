import scenarios from "../data/scenarios.json";
import { useGame } from "../store/gameStore";
import { missionChips } from "../physics/missionFacts";
import { plansFor } from "../physics/plan";

export function ChooseMission() {
  const pick = useGame((s) => s.pickScenario);
  return (
    <div>
      <h2>Choose a mission</h2>
      <div className="cards">
        {scenarios.map((sc) => (
          <div key={sc.id} className="card">
            <div className="tag">{sc.level}</div>
            <h3>{sc.name}</h3>
            <p><b>Pick a goal:</b> {plansFor(sc.id).objectives.map((o) => `${o.icon} ${o.name}`).join(" · ")}</p>
            <p>{sc.description}</p>
            <p className="facts-line">
              <b>Budget:</b> ${sc.budget}M · <b>Trip:</b> about {sc.tripDays < 30 ? sc.tripDays + " days" : Math.round(sc.tripDays / 30) + " months"}
            </p>
            <div className="affects mission-chips">
              {missionChips(sc).map((c) => (
                <span key={c.id} className={"affect " + c.tone} title={c.help} aria-label={`${c.label}. ${c.help}`}>{c.label}</span>
              ))}
            </div>
            <button className="primary" aria-label={`Design this mission: ${sc.name}`} onClick={() => pick(sc.id)}>Design this mission</button>
          </div>
        ))}
      </div>
    </div>
  );
}
