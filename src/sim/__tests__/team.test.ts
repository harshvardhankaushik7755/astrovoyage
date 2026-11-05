import { describe, it, expect, beforeEach } from "vitest";
import parts from "../../data/parts.json";
import scenarios from "../../data/scenarios.json";
import events from "../../data/events.json";
import settings from "../../data/settings.json";
import team from "../../data/team.json";
import { runChecks, findScenario, type Design } from "../../physics/checks";
import { fuelNeeded } from "../../physics/rocketEquation";
import { assignRoles, evaluateGoals, everyoneAgreed, ownerOf, ownerOfPart, say, teamBonus, ROLES, type RoleId } from "../team";
import { useGame } from "../../store/gameStore";

const ALL_ROLES: RoleId[] = ["lead", "engineer", "science", "comms"];

describe("assignRoles", () => {
  it.each([2, 3, 4])("gives every one of the four roles to exactly one of %i players", (n) => {
    const players = assignRoles(Array.from({ length: n }, (_, i) => `P${i}`));
    expect(players).toHaveLength(n);
    expect(players.flatMap((p) => p.roles).sort()).toEqual([...ALL_ROLES].sort());
    players.forEach((p) => expect(p.roles.length).toBeGreaterThan(0));
  });

  it("keeps the two sides of each argument apart: whoever saves money is not whoever wants more science", () => {
    for (const n of [2, 3, 4]) {
      const players = assignRoles(Array.from({ length: n }, () => ""));
      const lead = players.find((p) => p.roles.includes("lead"))!;
      expect(lead.roles).not.toContain("science");
      expect(lead.roles).not.toContain("comms");
    }
  });

  it("names empty players and clamps the team to 2–4", () => {
    expect(assignRoles(["  ", "Ravi"]).map((p) => p.name)).toEqual(["Player 1", "Ravi"]);
    expect(assignRoles(["Solo"])).toHaveLength(2);
    expect(assignRoles(["a", "b", "c", "d", "e"])).toHaveLength(4);
  });
});

describe("ownership", () => {
  const four = assignRoles(["Asha", "Ben", "Chen", "Dev"]);

  it("every Design Lab group and the launch calendar has an owner", () => {
    for (const thing of ["body", "instruments", "power", "comms", "engine", "rocket", "launch"] as const) {
      expect(ownerOf(four, thing).player).toBeDefined();
    }
    expect(ownerOf(four, "instruments").player.name).toBe("Chen");
    expect(ownerOf(four, "comms").player.name).toBe("Dev");
  });

  it("every challenge in events.json goes to someone, and the work is shared out", () => {
    const callers = new Set<string>();
    for (const ev of events) {
      const owner = ownerOfPart(four, ev.affectsPart);
      expect(owner.player).toBeDefined();
      callers.add(owner.player.name);
    }
    expect(callers.size).toBe(4);
  });

  it("a part owner in team.json always names a real role", () => {
    for (const roleId of Object.values(team.partOwner)) expect(ROLES.map((r) => r.id)).toContain(roleId);
  });
});

/** Every design the parts allow, with fuel set by the Design Lab's own "enough + reserve" button. */
function everyDesign(scenarioId: string) {
  const sc = findScenario(scenarioId);
  const subsets = parts.instruments.map((i) => i.id).reduce<string[][]>((acc, x) => acc.concat(acc.map((s) => [...s, x])), [[]]);
  const out: { design: Design; route: "fast" | "slow" }[] = [];
  for (const b of parts.bodies) for (const ins of subsets) for (const p of parts.powerSources) for (const a of parts.antennas)
    for (const e of parts.engines) for (const rk of parts.rockets) for (const route of ["fast", "slow"] as const) {
      const d: Design = { bodyId: b.id, instrumentIds: ins, powerId: p.id, antennaId: a.id, engineId: e.id, rocketId: rk.id, fuelKg: 0 };
      const dry = runChecks(d, sc, sc.preset.launchMonth, route);
      d.fuelKg = Math.ceil(fuelNeeded(e.isp, dry.dryMassKg, dry.dv.value) * settings.fuelMargin);
      out.push({ design: d, route });
    }
  return out;
}

describe("team goals", () => {
  const players = assignRoles(["Asha", "Ben", "Chen", "Dev"]);

  it.each(scenarios.map((s) => s.id))("%s: more than one different spacecraft meets every goal at once", (id) => {
    const sc = findScenario(id);
    const winners = everyDesign(id).filter(({ design, route }) => {
      const r = runChecks(design, sc, sc.preset.launchMonth, route);
      return r.allOk && evaluateGoals(players, id, r).every((g) => g.met);
    });
    // "there is rarely a single perfect solution": count spacecraft that differ in parts, not just in route
    const distinct = new Set(winners.map(({ design }) => JSON.stringify({ ...design, fuelKg: 0 })));
    expect(distinct.size).toBeGreaterThan(1);
  });

  it.each(scenarios.map((s) => s.id))("%s: the goals pull against each other, so 'just buy the best of everything' fails", (id) => {
    const sc = findScenario(id);
    const maxed: Design = { bodyId: "large", instrumentIds: ["camera", "spectrometer", "radar"], powerId: "solarLarge", antennaId: "antLarge", engineId: "chemical", rocketId: "heavy", fuelKg: 0 };
    const r0 = runChecks(maxed, sc, sc.preset.launchMonth, "slow");
    maxed.fuelKg = Math.ceil(fuelNeeded(320, r0.dryMassKg, r0.dv.value) * settings.fuelMargin);
    const goals = evaluateGoals(players, id, runChecks(maxed, sc, sc.preset.launchMonth, "slow"));
    expect(goals.every((g) => g.met)).toBe(false);
  });

  it("reports each goal with its owner, the target and where it stands now", () => {
    const sc = findScenario("moon");
    const r = runChecks(sc.preset as unknown as Design, sc, sc.preset.launchMonth, "slow");
    const goals = evaluateGoals(players, "moon", r);
    expect(goals.map((g) => g.roleId)).toEqual(ALL_ROLES);
    const science = goals.find((g) => g.roleId === "science")!;
    expect(science.playerName).toBe("Chen");
    expect(science.text).toBe(`Collect at least ${team.goals.byScenario.moon.science} science points`);
    expect(science.now).toBe(`now ${r.science}`);
    expect(science.met).toBe(r.science >= team.goals.byScenario.moon.science);
  });

  it("after a flight the Science Lead is judged on the science that came home", () => {
    const sc = findScenario("moon");
    const r = runChecks(sc.preset as unknown as Design, sc, sc.preset.launchMonth, "slow");
    expect(evaluateGoals(players, "moon", r, 999).find((g) => g.roleId === "science")!.met).toBe(true);
    expect(evaluateGoals(players, "moon", r, 0).find((g) => g.roleId === "science")!.met).toBe(false);
  });

  it("scores points per goal and a bonus only when every goal is met", () => {
    const g = evaluateGoals(players, "moon", runChecks(findScenario("moon").preset as unknown as Design, findScenario("moon"), 3, "slow"));
    const all = g.map((x) => ({ ...x, met: true }));
    const none = g.map((x) => ({ ...x, met: false }));
    const { pointsPerGoal, allGoalsBonus } = team.scoring;
    expect(teamBonus(all)).toEqual({ bonus: 4 * pointsPerGoal + allGoalsBonus, allMet: true });
    expect(teamBonus(none)).toEqual({ bonus: 0, allMet: false });
    expect(teamBonus([{ ...all[0] }, ...none.slice(1)])).toEqual({ bonus: pointsPerGoal, allMet: false });
  });

  it("fills sentence holes and leaves unknown ones visible", () => {
    expect(say("{name}'s call", { name: "Asha" })).toBe("Asha's call");
    expect(say("{x}", {})).toBe("{x}");
  });
});

describe("sign-off in the store", () => {
  beforeEach(() => useGame.getState().reset());

  it("launch needs every player, and any change to the plan clears every 'I agree'", () => {
    const g = useGame.getState;
    g().startTeam(["Asha", "Ben", "Chen"]);
    expect(g().screen).toBe("choose");
    expect(g().team).toHaveLength(3);
    g().pickScenario("moon");
    g().loadPreset();
    g().team!.forEach((p) => g().toggleSignoff(p.id));
    expect(everyoneAgreed(g().team!, g().signoffs)).toBe(true);

    g().toggleInstrument("radar");
    expect(g().signoffs).toEqual([]);
    g().team!.forEach((p) => g().toggleSignoff(p.id));
    g().setLaunchMonth(5);
    expect(g().signoffs).toEqual([]);
    g().toggleSignoff("p1");
    g().setRoute("fast");
    expect(g().signoffs).toEqual([]);
    g().toggleSignoff("p1");
    g().setPart("fuelKg", 100);
    expect(g().signoffs).toEqual([]);
  });

  it("a player can take back their 'I agree'", () => {
    const g = useGame.getState;
    g().startTeam(["Asha", "Ben"]);
    g().toggleSignoff("p1");
    g().toggleSignoff("p1");
    expect(g().signoffs).toEqual([]);
  });

  it("the team stays for the next mission, and playing alone breaks it up", () => {
    const g = useGame.getState;
    g().startTeam(["Asha", "Ben"]);
    g().reset();
    expect(g().team).toHaveLength(2);
    g().playSolo();
    expect(g().team).toBeNull();
  });
});
