/**
 * Balance sweep (Stage 5). Flies a set of designs through the real engine, 200 random missions each,
 * with mission control always taking the safest option, and prints a markdown table.
 *
 *   npm run balance
 *
 * The rows are the designs recorded in BALANCE_NOTES.md: cheap, balanced (the preset) and over-built for each
 * scenario, plus the goal checks (Moon beginner path, Mars ion, Jupiter small and large panels, RTG).
 */
import settings from "../src/data/settings.json";
import { runChecks, findScenario, getEngine, type Design } from "../src/physics/checks";
import { fuelNeeded } from "../src/physics/rocketEquation";
import { createSimulation, step, resolveEvent, safestOption, MILESTONE_TEXTS, type SimState } from "../src/sim/simulation";

const RUNS = 200;
type Route = "slow" | "fast";
interface Row { scenario: string; label: string; design: Design; month: number; route: Route }

/** What the "Set to enough + reserve" button would put in the tank for this design. */
function buttonFuel(design: Design, scenarioId: string, month: number, route: Route): Design {
  const sc = findScenario(scenarioId);
  const r = runChecks(design, sc, month, route);
  const kg = Math.ceil(fuelNeeded(getEngine(design.engineId).isp, r.dryMassKg, r.dv.value) * settings.fuelMargin); // exactly what the button does
  return { ...design, fuelKg: kg };
}

const rows: Row[] = [];
const add = (scenario: string, label: string, design: Design, month: number, route: Route = "slow") =>
  rows.push({ scenario, label, design, month, route });
const preset = (id: string) => {
  const p = findScenario(id).preset;
  return { design: { bodyId: p.bodyId, instrumentIds: p.instrumentIds, powerId: p.powerId, antennaId: p.antennaId, engineId: p.engineId, rocketId: p.rocketId, fuelKg: p.fuelKg }, month: p.launchMonth };
};

const beginner: Design = { bodyId: "small", instrumentIds: ["camera"], powerId: "solarSmall", antennaId: "antSmall", engineId: "chemical", rocketId: "light", fuelKg: 500 };
add("moon", "beginner: default parts + the fuel button", buttonFuel(beginner, "moon", 3, "slow"), 3);
add("moon", "cheap", { ...beginner, fuelKg: 1000 }, 3);
add("moon", "balanced (preset)", preset("moon").design, preset("moon").month);
add("moon", "over-built", { bodyId: "large", instrumentIds: ["camera", "spectrometer", "radar"], powerId: "solarLarge", antennaId: "antLarge", engineId: "chemical", rocketId: "heavy", fuelKg: 6000 }, 3);

const marsCheap: Design = { bodyId: "small", instrumentIds: ["camera"], powerId: "solarSmall", antennaId: "antLarge", engineId: "chemical", rocketId: "light", fuelKg: 1600 };
add("mars", "tightest design that passes the checks", { ...marsCheap, fuelKg: 1550 }, 10);
add("mars", "cheap: light rocket, careful fuel", marsCheap, 10);
add("mars", "balanced (preset)", preset("mars").design, preset("mars").month);
add("mars", "ion engine", { bodyId: "small", instrumentIds: ["camera"], powerId: "solarLarge", antennaId: "antLarge", engineId: "ion", rocketId: "light", fuelKg: 200 }, 10);
add("mars", "ion engine with only the fuel button", buttonFuel({ bodyId: "small", instrumentIds: ["camera"], powerId: "solarLarge", antennaId: "antLarge", engineId: "ion", rocketId: "light", fuelKg: 0 }, "mars", 10, "slow"), 10);
add("mars", "over-built", { bodyId: "medium", instrumentIds: ["camera", "spectrometer", "weather"], powerId: "solarLarge", antennaId: "antLarge", engineId: "chemical", rocketId: "heavy", fuelKg: 5000 }, 10);

add("jupiter", "small solar (must fail)", { bodyId: "small", instrumentIds: ["camera"], powerId: "solarSmall", antennaId: "antLarge", engineId: "chemical", rocketId: "heavy", fuelKg: 4500 }, 4);
add("jupiter", "large solar", { bodyId: "small", instrumentIds: ["camera"], powerId: "solarLarge", antennaId: "antLarge", engineId: "chemical", rocketId: "heavy", fuelKg: 4500 }, 4);
add("jupiter", "RTG", { bodyId: "small", instrumentIds: ["camera", "magnetometer"], powerId: "rtg", antennaId: "antLarge", engineId: "chemical", rocketId: "heavy", fuelKg: 4500 }, 4);
add("jupiter", "balanced (preset)", preset("jupiter").design, preset("jupiter").month);
add("jupiter", "over-built", { bodyId: "large", instrumentIds: ["camera", "magnetometer", "spectrometer"], powerId: "rtg", antennaId: "antLarge", engineId: "chemical", rocketId: "heavy", fuelKg: 9000 }, 4);

/**
 * Why a mission ended without reaching orbit. The last log line can be a milestone the clock passed
 * on the way (a lost week can cross one), so skip those, and from a decision line take the last
 * sentence, which is what actually happened rather than the choice that led to it.
 */
function failureReason(s: SimState): string {
  const line = [...s.log].reverse().find((l) => !MILESTONE_TEXTS.includes(l.text));
  if (!line) return "unknown";
  const sentences = line.text.split(". ").map((x) => x.trim()).filter(Boolean);
  const last = sentences.length > 1 ? sentences[sentences.length - 1] : line.text;
  return last.replace(/\.$/, "");
}

console.log("| Scenario | Design | Parts | Fuel kg | Cost $M | Checks | Orbit (200 runs) | Avg science | Failures |");
console.log("|---|---|---|---|---|---|---|---|---|");
for (const row of rows) {
  const sc = findScenario(row.scenario);
  const d = row.design;
  const check = runChecks(d, sc, row.month, row.route);
  let orbit = 0;
  let science = 0;
  const why = new Map<string, number>();
  if (check.allOk) {
    for (let seed = 1; seed <= RUNS; seed++) {
      let s = createSimulation(d, sc, row.month, row.route, check, seed);
      for (let i = 0; i < 10000 && s.phase !== "orbit" && s.phase !== "failed"; i++) {
        s = s.pendingEvent ? resolveEvent(s, safestOption(s.pendingEvent).id, true) : step(s, s.totalDays / 100);
      }
      if (s.phase === "orbit") {
        orbit++;
        science += s.scienceCollected;
      } else {
        why.set(failureReason(s), (why.get(failureReason(s)) ?? 0) + 1);
      }
    }
  }
  const parts = `${d.bodyId}, ${d.instrumentIds.join("+") || "no instruments"}, ${d.powerId}, ${d.antennaId}, ${d.engineId}, ${d.rocketId}`;
  const checks = check.allOk ? "pass" : "FAIL: " + check.problems.map((p) => p.split(":")[0].split(".")[0]).join("; ");
  const fails = [...why.entries()].map(([t, n]) => `${n}x ${t}`).join("; ") || "-";
  const avg = check.allOk && orbit ? `${(science / orbit).toFixed(1)} of ${check.science}` : "-";
  console.log(`| ${sc.name} | ${row.label} | ${parts} | ${d.fuelKg} | ${check.budget.value}/${check.budget.limit} | ${checks} | ${check.allOk ? `${orbit}/${RUNS}` : "-"} | ${avg} | ${fails} |`);
}
