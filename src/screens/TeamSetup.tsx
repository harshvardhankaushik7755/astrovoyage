import { useState } from "react";
import { useGame } from "../store/gameStore";
import { assignRoles, getRole, say, MAX_PLAYERS, MIN_PLAYERS, TEAM_TEXT as T } from "../sim/team";

/** Team setup: type 2–4 names and see straight away which jobs each person gets. */
export function TeamSetup() {
  const { team, startTeam, go } = useGame();
  const [names, setNames] = useState<string[]>(() => team?.map((p) => p.name) ?? ["", ""]);
  const players = assignRoles(names);
  const setName = (i: number, v: string) => setNames(names.map((n, j) => (j === i ? v : n)));

  return (
    <div className="center team-setup">
      <h2>{T.setupTitle}</h2>
      <p className="lead">{T.setupLead}</p>
      <ol className="team-list">
        {players.map((p, i) => (
          <li key={p.id} className="team-player">
            <div className="row">
              <input className="name-input" value={names[i]} maxLength={20} placeholder={`Player ${i + 1}`}
                aria-label={say(T.nameLabel, { n: i + 1 })} onChange={(e) => setName(i, e.target.value)} />
              {names.length > MIN_PLAYERS && (
                <button className="link" onClick={() => setNames(names.filter((_, j) => j !== i))}>{T.removePlayer}</button>
              )}
            </div>
            {p.roles.map((id) => {
              const r = getRole(id);
              return (
                <p key={id} className="role-line">
                  <b>{`${r.icon} ${r.name}`}</b> <span className="muted">{`— ${r.job}`}</span>
                </p>
              );
            })}
          </li>
        ))}
      </ol>
      {names.length < MAX_PLAYERS && <button onClick={() => setNames([...names, ""])}>{T.addPlayer}</button>}
      <div className="row center-row">
        <button onClick={() => go("home")}>{T.back}</button>
        <button className="primary big" onClick={() => startTeam(names)}>{T.start}</button>
      </div>
    </div>
  );
}
