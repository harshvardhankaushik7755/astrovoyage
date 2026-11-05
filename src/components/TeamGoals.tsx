import { getRole, TEAM_TEXT as T, type GoalResult } from "../sim/team";

/**
 * The four team goals, each with who owns it, where it stands now and a ✅ or ⬜.
 * `compact` is one line per goal for the Design Lab and Launch screens, which must fit a laptop;
 * the full sentence and the reason behind the goal are on hover and on the results screen.
 */
export function TeamGoals({ goals, compact = false, hint = true }: { goals: GoalResult[]; compact?: boolean; hint?: boolean }) {
  return (
    <section className={"team-goals" + (compact ? " compact" : "")} aria-label={T.panelTitle}>
      <h4>{T.panelTitle}</h4>
      <ul>
        {goals.map((g) => {
          const r = getRole(g.roleId);
          return (
            <li key={g.roleId} className={g.met ? "met" : "missed"} title={`${r.name}: ${g.text}. ${r.why}`}>
              <span role="img" aria-label={g.met ? T.met : T.missed}>{g.met ? "✅" : "⬜"}</span>
              {compact ? (
                <span><b>{`${r.icon} ${g.playerName}`}</b>{` ${g.short} `}<span className="muted">{`(${g.now})`}</span></span>
              ) : (
                <span>
                  <b>{`${r.icon} ${g.playerName}`}</b> <span className="muted small">{r.name}</span>
                  <br />{g.text} <span className="muted">{`(${g.now})`}</span>
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {hint && <p className="muted small">{T.panelHint}</p>}
    </section>
  );
}

/** "🔬 Chen" next to a part group or the launch calendar. */
export function OwnerBadge({ name, roleId }: { name: string; roleId: GoalResult["roleId"] }) {
  const r = getRole(roleId);
  return <span className="owner-badge" title={r.name}>{`${r.icon} ${name}`}</span>;
}
