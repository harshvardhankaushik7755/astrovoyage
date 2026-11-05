// @vitest-environment jsdom
/**
 * Stage 12 Part 2: the challenge happens to YOUR spacecraft.
 *
 * Two rules the stage is built on, and both are tested here. The card shows the machine the player
 * built with the part that is going wrong marked on it — and the picture is never the only way to
 * play: every option stays a real button with its own words, the schematic is hidden from a screen
 * reader, and the whole card works from the keyboard alone.
 */
import { describe, it, expect, afterEach } from "vitest";
import { renderToString } from "react-dom/server";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { MissionView } from "../MissionControl";
import { MissionControl } from "../MissionControl";
import { useGame } from "../../store/gameStore";
import { damageFor, optionPart } from "../../sim/context";
import { shipLayout, type ShipPart } from "../../sim/shipLayout";
import { createSimulation, step, EVENT_DEFS, type SimState } from "../../sim/simulation";
import { runChecks, findScenario, type Design } from "../../physics/checks";

const noop = () => {};
const MOON: Design = { bodyId: "small", instrumentIds: ["camera", "magnetometer"], powerId: "solarSmall", antennaId: "antSmall", engineId: "chemical", rocketId: "medium", fuelKg: 1400 };
const PARTS: ShipPart[] = ["body", "power", "antenna", "instruments", "engine"];

/** A Moon mission stopped at one challenge, with the card open. */
function atChallenge(eventId: string, design = MOON): SimState {
  const sc = findScenario("moon");
  const s = step(createSimulation(design, sc, 3, "slow", runChecks(design, sc, 3, "slow"), 1, [{ day: 1, eventId }]), 2);
  expect(s.pendingEvent?.id).toBe(eventId);
  return s;
}
function card(sim: SimState, design = MOON): string {
  return renderToString(
    <MissionView sim={sim} design={design} speed={1} onSpeed={noop} fx={{ arrival: sim.pendingEvent?.id ?? null, flash: null, countdown: null, burning: false }}
      instruments={["Camera", "Magnetometer"]} clockOffset={0} clockFlash={false} shake={false} secondsLeft={12}
      contextOpen={false} onToggleContext={noop} openInfo={null} onOpenInfo={noop} spaceView={false} onToggleSpace={noop}
      onDecide={noop} onSeeResults={noop} />,
  );
}
/** The part marked on the schematic, read back out of the drawing. */
function marked(svg: string): string[] {
  return [...svg.matchAll(/<g class="part hit[^"]*" data-part="([^"]+)"/g)].map((m) => m[1]);
}

describe("every challenge knows which part of the spacecraft it happens to", () => {
  it("says so in events.json, for every single event", () => {
    for (const def of EVENT_DEFS) {
      expect(def, `${def.id} has no affectsPart`).toHaveProperty("affectsPart");
      expect(def.affectsPart === null || PARTS.includes(def.affectsPart), `${def.id}: ${def.affectsPart}`).toBe(true);
    }
  });

  it("names only parts the schematic can actually draw", () => {
    const drawable = new Set(shipLayout({ ...MOON, powerId: "rtg" }).pieces.map((p) => p.part));
    for (const p of shipLayout(MOON).pieces) drawable.add(p.part);
    for (const def of EVENT_DEFS) {
      if (def.affectsPart) expect(drawable, `${def.id} points at a part that is never drawn`).toContain(def.affectsPart);
    }
  });

  it("leaves it null only for the events that are about the whole mission, not one part", () => {
    const whole = EVENT_DEFS.filter((d) => d.affectsPart === null).map((d) => d.id);
    expect(whole).toEqual(["debris", "planetaryProtection", "gravityAssist"]);
  });

  it("gives the events that break something a look to match, and the rest none", () => {
    expect(damageFor("dust")).toBe("dust");
    expect(damageFor("lostSignal")).toBe("turned");
    expect(damageFor("instrumentFault")).toBe("dark");
    expect(damageFor("debrisDamage")).toBe("dent");
    expect(damageFor("bonusTarget")).toBe(null); // an opportunity breaks nothing
    for (const def of EVENT_DEFS) {
      if (damageFor(def.id)) expect(def.affectsPart, `${def.id} is damaged but hits no part`).not.toBe(null);
    }
  });
});

describe("the card shows it happening", () => {
  it("draws the spacecraft and marks the part that is going wrong", () => {
    const svg = card(atChallenge("dust"));
    expect(svg).toContain('class="schematic"');
    expect(marked(svg)).toEqual(["power", "power"]); // both wings
    expect(svg).toContain('data-damage="dust"');
  });

  it("marks a different part for a different challenge", () => {
    expect(marked(card(atChallenge("lostSignal")))).toEqual(["antenna", "antenna"]);
    expect(marked(card(atChallenge("instrumentFault")))).toEqual(["instruments", "instruments"]);
    expect(marked(card(atChallenge("solarStorm")))).toEqual(["body"]);
  });

  it("marks nothing at all when the challenge is about the whole mission", () => {
    expect(marked(card(atChallenge("debris")))).toEqual([]);
  });

  it("names the part in the player's own words, the ones they chose in the Design Lab", () => {
    expect(card(atChallenge("dust"))).toContain("Small solar panels");
    expect(card(atChallenge("lostSignal"))).toContain("Small antenna");
    const big = card(atChallenge("dust"), { ...MOON, powerId: "solarLarge" });
    expect(big).toContain("Large solar panels");
  });

  it("works out which part one option would change, and falls back to the event's own part", () => {
    expect(optionPart({ powerPenalty: 0.1 }, null)).toBe("power");
    expect(optionPart({ signalPenalty: 0.1 }, null)).toBe("antenna");
    expect(optionPart({ sciencePenalty: 0.1 }, null)).toBe("instruments");
    expect(optionPart({ fuelCost: 8 }, null)).toBe("engine");
    expect(optionPart({ riskOfFailure: 0.2 }, "body")).toBe("body"); // a risk is about the whole mission
  });
});

describe("the picture is never the only way to play", () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;
  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    root = null;
    host = null;
  });

  /** The real screen, with a challenge waiting. */
  function mount(eventId: string): HTMLDivElement {
    const g = useGame.getState();
    g.reset();
    // these tests are about the card itself, so skip the beat that plays before it (Stage 12 Part 3)
    useGame.setState({ skipAnimations: true });
    g.pickScenario("moon");
    g.loadPreset();
    g.startMission();
    const sc = findScenario("moon");
    const { design, launchMonth, route } = useGame.getState();
    useGame.setState({ sim: step(createSimulation(design, sc, launchMonth, route, runChecks(design, sc, launchMonth, route), 1, [{ day: 1, eventId }]), 2) });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(<MissionControl />));
    return host;
  }
  const options = () => [...host!.querySelectorAll<HTMLButtonElement>(".option")];

  it("hides the schematic from a screen reader and puts nothing focusable inside it", () => {
    mount("dust");
    const svg = host!.querySelector(".schematic")!;
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.querySelectorAll("button, a, input, [tabindex]")).toHaveLength(0);
  });

  it("plays a challenge from the keyboard alone, start to finish", () => {
    mount("dust");
    const before = useGame.getState().sim!.decisions.length;
    // the card takes focus when it opens, so the player is already on the first option
    expect(document.activeElement).toBe(options()[0]);
    // every option is a real button with its own words, in the order they are read, none skipped over
    for (const o of options()) {
      expect(o.tagName).toBe("BUTTON");
      expect(o.textContent!.trim().length).toBeGreaterThan(8);
      expect(o.getAttribute("tabindex")).toBe(null);
      expect(o.disabled).toBe(false);
    }
    // move along the options the way Tab does, then take the one in hand
    const second = options()[1];
    act(() => second.focus());
    expect(document.activeElement).toBe(second);
    act(() => second.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    const after = useGame.getState().sim!;
    expect(after.decisions).toHaveLength(before + 1);
    expect(after.decisions[after.decisions.length - 1].optionId).toBe("nothing");
    expect(after.pendingEvent).toBe(null); // the card is gone and the mission is running again
  });

  it("points the schematic at what the option in hand would change, without losing the broken part", () => {
    mount("dust");
    const broken = () => [...host!.querySelectorAll(".part.hit")].map((g) => g.getAttribute("data-part"));
    const aimed = () => [...host!.querySelectorAll(".part.aim")].map((g) => g.getAttribute("data-part"));
    // the dusty panels stay marked for as long as the card is open, whatever the player is looking at
    expect(broken()).toEqual(["power", "power"]);
    // "Shake the spacecraft" costs fuel, so it rings the engine
    act(() => options()[0].focus());
    expect(aimed()).toEqual(["engine"]);
    expect(broken()).toEqual(["power", "power"]);
    // "Do nothing" costs power, so it rings the panels themselves
    act(() => options()[1].focus());
    expect(aimed()).toEqual(["power", "power"]);
    act(() => options()[1].blur());
    expect(aimed()).toEqual([]);
  });
});
