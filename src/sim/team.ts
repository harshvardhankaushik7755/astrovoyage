/**
 * Team mode: up to four people share one screen, each with a role, a goal and the parts they own.
 * Pure functions, no React. Every number and every sentence comes from src/data/team.json.
 *
 * The four goals are chosen to pull against each other: Science wants more instruments, Comms wants a
 * bigger antenna, the Engineer wants spare power and the Lead wants money left over. A test checks that
 * every scenario still has more than one design that meets all four, so the team can always win by talking.
 */
import team from "../data/team.json";
import type { CheckResult } from "../physics/checks";

export type RoleId = "lead" | "engineer" | "science" | "comms";
export type Role = (typeof team.roles)[number] & { id: RoleId };
/** The Design Lab groups plus the launch calendar, which is what a role can own. */
export type OwnedThing = "body" | "instruments" | "power" | "comms" | "engine" | "rocket" | "launch";

export interface Player { id: string; name: string; roles: RoleId[] }

export interface GoalResult {
  roleId: RoleId;
  playerName: string;
  text: string;   // "Keep at least 25% of the budget unspent"
  short: string;  // "25% of budget left", for the one-line list
  now: string;    // "now 31%"
  met: boolean;
}

export const ROLES = team.roles as Role[];
export const TEAM_TEXT = team.text;
export const MIN_PLAYERS = team.minPlayers;
export const MAX_PLAYERS = team.maxPlayers;
export const ALL_GOALS_BONUS = team.scoring.allGoalsBonus;

export const getRole = (id: RoleId) => ROLES.find((r) => r.id === id)!;

/** Fill "{name}" style holes in a sentence from team.json. */
export function say(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k] ?? `{${k}}`));
}

/**
 * Give out the four roles. Empty names become "Player 1", "Player 2"…
 * With fewer than four people some hold two roles, paired so the two sides of each argument
 * (save money vs. do more science) still sit with different people.
 */
export function assignRoles(names: string[]): Player[] {
  const n = Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, names.length));
  const plan = (team.assignments as Record<string, RoleId[][]>)[String(n)];
  return plan.map((roles, i) => ({ id: `p${i + 1}`, name: names[i]?.trim() || `Player ${i + 1}`, roles }));
}

export const playerWithRole = (players: Player[], role: RoleId) => players.find((p) => p.roles.includes(role))!;

/** Who owns a Design Lab group (or the launch calendar). */
export function ownerOf(players: Player[], thing: OwnedThing): { player: Player; roleId: RoleId } {
  const role = ROLES.find((r) => (r.owns as string[]).includes(thing))!;
  return { player: playerWithRole(players, role.id), roleId: role.id };
}

/**
 * Who gets the final say on a challenge, from the part it happens to (events.json affectsPart).
 * A challenge to the whole mission, with no one part, is the Mission Lead's.
 */
export function ownerOfPart(players: Player[], part: string | null): { player: Player; role: Role } {
  const roleId = (part && (team.partOwner as Record<string, RoleId>)[part]) || "lead";
  return { player: playerWithRole(players, roleId), role: getRole(roleId) };
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

/**
 * Each role's goal, checked against a design. `scienceCollected` is used after a flight, so the
 * Science Lead is judged on what actually came home, not what was planned.
 */
export function evaluateGoals(players: Player[], scenarioId: string, check: CheckResult, scienceCollected?: number): GoalResult[] {
  const g = team.goals;
  const sc = (g.byScenario as Record<string, { moneyLeft: number; science: number }>)[scenarioId];
  const moneyLeft = check.budget.limit > 0 ? (check.budget.limit - check.budget.value) / check.budget.limit : 0;
  const margin = check.power.value > 0 ? check.power.limit / check.power.value - 1 : Infinity;
  const science = scienceCollected ?? check.science;
  const results: Omit<GoalResult, "playerName" | "text" | "short">[] = [
    { roleId: "lead", now: `now ${pct(Math.max(0, moneyLeft))}`, met: moneyLeft >= sc.moneyLeft },
    { roleId: "engineer", now: isFinite(margin) ? `now ${pct(Math.max(0, margin))}` : "no power needed", met: margin >= g.powerMargin },
    { roleId: "science", now: `now ${science}`, met: science >= sc.science },
    { roleId: "comms", now: `now ${pct(check.comms.fraction)}`, met: check.comms.fraction >= g.dataHome },
  ];
  const need: Record<RoleId, string> = { lead: pct(sc.moneyLeft), engineer: pct(g.powerMargin), science: String(sc.science), comms: pct(g.dataHome) };
  return results.map((r) => ({
    ...r,
    playerName: playerWithRole(players, r.roleId).name,
    text: say(getRole(r.roleId).goal, { need: need[r.roleId] }),
    short: say(getRole(r.roleId).short, { need: need[r.roleId] }),
  }));
}

/** Points for goals met, plus a bonus when every goal is met at once. */
export function teamBonus(goals: GoalResult[]): { bonus: number; allMet: boolean } {
  const met = goals.filter((x) => x.met).length;
  const allMet = goals.length > 0 && met === goals.length;
  return { bonus: met * team.scoring.pointsPerGoal + (allMet ? team.scoring.allGoalsBonus : 0), allMet };
}

export const everyoneAgreed = (players: Player[], signoffs: string[]) => players.every((p) => signoffs.includes(p.id));
