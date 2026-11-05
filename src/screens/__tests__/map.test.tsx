/**
 * Stage 11 Part 2: scenery behind, mission in front.
 *
 * The rule the whole stage hangs on is that a player never has to wonder whether a dot matters.
 * These tests read the rendered map and check that every mission object carries its own class and that
 * nothing decorative borrows one.
 */
import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { MissionView } from "../MissionControl";
import { createSimulation, step, type SimState } from "../../sim/simulation";
import { runChecks, findScenario, type Design } from "../../physics/checks";
import skyData from "../../data/sky.json";
import { readFileSync } from "node:fs";

const noop = () => {};
const MOON: Design = { bodyId: "small", instrumentIds: ["camera", "magnetometer"], powerId: "solarSmall", antennaId: "antSmall", engineId: "chemical", rocketId: "medium", fuelKg: 1400 };
const MARS: Design = { bodyId: "small", instrumentIds: ["camera"], powerId: "solarSmall", antennaId: "antLarge", engineId: "chemical", rocketId: "light", fuelKg: 1800 };

function fly(design: Design, scenarioId: string, month: number, days: number): SimState {
  const sc = findScenario(scenarioId);
  return step(createSimulation(design, sc, month, "slow", runChecks(design, sc, month, "slow"), 1, []), days);
}
function html(sim: SimState, design: Design): string {
  return renderToString(
    <MissionView sim={sim} design={design} speed={1} onSpeed={noop} fx={{ arrival: null, flash: null, countdown: null, burning: false }}
      instruments={["Camera"]} clockOffset={0} clockFlash={false} shake={false} secondsLeft={null}
      contextOpen={false} onToggleContext={noop} openInfo={null} onOpenInfo={noop} spaceView={false} onToggleSpace={noop}
      onDecide={noop} onSeeResults={noop} />,
  );
}

/** Every drawn element, as its tag and its class list. */
function elements(svg: string): { tag: string; cls: string }[] {
  return [...svg.matchAll(/<(circle|ellipse|rect|polygon|polyline|text|line)\b([^>]*)>/g)].map((m) => ({
    tag: m[1],
    cls: (m[2].match(/class="([^"]*)"/) ?? ["", ""])[1],
  }));
}

const MISSION_CLASSES = ["orbit", "trail", "sun-core", "sun-corona", "planet", "earth", "target", "ship", "label", "label-pill"];

describe("the mission objects are all there and all named", () => {
  it("a Sun-centred trip draws the Sun, both orbits, both bodies and the flown path", () => {
    const svg = html(fly(MARS, "mars", 10, 60), MARS);
    expect(svg).toContain('class="sun-corona"');
    expect(svg).toContain('class="sun-core"');
    expect(svg).toContain('class="planet earth"');
    expect(svg).toContain('class="planet target"');
    expect(svg).toContain('class="trail"');
    expect((svg.match(/class="orbit"/g) ?? []).length).toBe(2); // Earth's orbit and Mars's
    expect(svg).toContain('class="ship-halo"');
  });

  it("an Earth-centred trip puts Earth in the middle, with no Sun", () => {
    const svg = html(fly(MOON, "moon", 3, 1), MOON);
    expect(svg).not.toContain('class="sun-core"');
    expect(svg).not.toContain('class="sun-corona"');
    expect(svg).toContain('class="planet earth"');
    expect(svg).toContain('class="planet target"');
    expect((svg.match(/class="orbit"/g) ?? []).length).toBe(1);
  });

  it("every label sits on its own dark pill, so it is never lost against a star", () => {
    const svg = html(fly(MARS, "mars", 10, 60), MARS);
    const pills = (svg.match(/class="label-pill"/g) ?? []).length;
    const labels = (svg.match(/class="label"/g) ?? []).length;
    expect(labels).toBe(3); // Sun, Earth, Mars
    expect(pills).toBe(labels);
  });
});

describe("the map earns its size (Stage 11 Part 4)", () => {
  it("shows a short fading lead ahead of the spacecraft, not a rail to the target", () => {
    const sim = fly(MARS, "mars", 10, 60);
    const svg = html(sim, MARS);
    expect(svg).toContain('class="trail"');
    expect(svg).toContain('class="path-lead"');
    // the plan is not drawn unless the player asks for it
    expect(svg).not.toContain('class="path-ahead"');

    const lead = svg.match(/class="path-lead"[^>]*points="([^"]+)"/)![1].split(" ");
    const flownPoints = svg.match(/class="trail" points="([^"]+)"/)![1].split(" ");
    // the lead starts at the spacecraft and covers about a tenth of the trip, no more
    expect(lead[0]).toBe(flownPoints[flownPoints.length - 1]);
    expect(lead.length).toBeGreaterThan(2);
    expect(lead.length).toBeLessThanOrEqual(0.1 * 200 + 2);
    // and it fades to nothing at its tip
    expect(svg).toContain('id="lead-fade"');
    expect(svg).toContain('stop-opacity="0"');
    // a line, never a filled shape: without this rule the lead paints as a black blob
    expect(readFileSync("src/styles.css", "utf8")).toMatch(/\.path-lead \{[^}]*fill: none/);
  });

  it("draws the whole planned path only when the player asks for it", () => {
    const sim = fly(MARS, "mars", 10, 60);
    const withPlan = renderToString(
      <MissionView sim={sim} design={MARS} speed={1} onSpeed={noop} fx={{ arrival: null, flash: null, countdown: null, burning: false }}
        instruments={["Camera"]} clockOffset={0} clockFlash={false} shake={false} secondsLeft={null}
        contextOpen={false} onToggleContext={noop} openInfo={null} onOpenInfo={noop} spaceView onToggleSpace={noop}
        showPlan onTogglePlan={noop} onDecide={noop} onSeeResults={noop} />,
    );
    expect(withPlan).toContain('class="path-ahead"');
    expect(withPlan).toContain("Planned path — this is where the plan says you will be.");
    const ahead = withPlan.match(/class="path-ahead" points="([^"]+)"/)![1].split(" ");
    expect(ahead.length).toBeGreaterThan(20); // the rest of the ellipse, all of it
  });

  it("offers the flight plan as a toggle in the HUD, off to begin with", () => {
    const sim = fly(MARS, "mars", 10, 60);
    const space = renderToString(
      <MissionView sim={sim} design={MARS} speed={1} onSpeed={noop} fx={{ arrival: null, flash: null, countdown: null, burning: false }}
        instruments={["Camera"]} clockOffset={0} clockFlash={false} shake={false} secondsLeft={null}
        contextOpen={false} onToggleContext={noop} openInfo={null} onOpenInfo={noop} spaceView onToggleSpace={noop}
        onDecide={noop} onSeeResults={noop} />,
    );
    expect(space).toContain("Show flight plan");
    expect(space).not.toContain('checked=""');
    expect(space).not.toContain('class="path-ahead"');
    expect(space).not.toContain("Planned path —");
  });

  it("carries a scale bar whose label matches the length it is drawn at", () => {
    const svg = html(fly(MARS, "mars", 10, 60), MARS);
    expect(svg).toContain('class="scale-bar"');
    const bar = svg.slice(svg.indexOf('class="scale-bar"'));
    const au = Number(bar.match(/([\d.]+) AU/)![1]);
    const drawn = Number(bar.match(/x2="([\d.]+)" y2="0"/)![1]);
    // a Mars map is 1.52 AU to the orbit radius, drawn at the map's own factor
    const pxPerAU = drawn / au;
    expect(pxPerAU).toBeGreaterThan(50);
    expect(bar).toMatch(/million km|thousand km/);
  });

  it("a Moon map measures in thousands of kilometres, a Jupiter map in millions", () => {
    const moon = html(fly(MOON, "moon", 3, 1), MOON);
    expect(moon.slice(moon.indexOf('class="scale-bar"'))).toContain("thousand km");
    const jup: Design = { bodyId: "small", instrumentIds: ["camera", "magnetometer"], powerId: "solarLarge", antennaId: "antLarge", engineId: "chemical", rocketId: "medium", fuelKg: 3500 };
    const jupiter = html(fly(jup, "jupiter", 4, 200), jup);
    expect(jupiter.slice(jupiter.indexOf('class="scale-bar"'))).toContain("million km");
  });
});

describe("nothing decorative borrows a mission class", () => {
  it("every sky element is a sky element and nothing else", () => {
    const svg = html(fly(MARS, "mars", 10, 60), MARS);
    const sky = elements(svg).filter((e) => e.cls.startsWith("sky"));
    expect(sky.length).toBeGreaterThan(skyData.stars.count); // the stars, the band, the washes and the rest
    for (const e of sky) {
      for (const mission of MISSION_CLASSES) {
        expect(e.cls.split(/\s+/), `${e.tag}.${e.cls}`).not.toContain(mission);
      }
    }
  });

  it("the sky is drawn first, so the mission is always painted on top of it", () => {
    const svg = html(fly(MARS, "mars", 10, 60), MARS);
    const lastStar = svg.lastIndexOf('class="sky-star');
    for (const missionMark of ['class="orbit"', 'class="trail"', 'class="sun-core"', 'class="planet target"', 'class="label"']) {
      expect(svg.indexOf(missionMark), missionMark).toBeGreaterThan(lastStar);
    }
  });

  it("no decorative thing is allowed to get as bright as the mission", () => {
    expect(skyData.stars.maxOpacity).toBeLessThanOrEqual(0.9);
    expect(skyData.milkyWay.opacity).toBeLessThanOrEqual(0.2);
    expect(skyData.galaxies.opacity).toBeLessThan(0.3);
    expect(skyData.nebulae.opacity).toBeLessThan(0.3);
  });
});
