// @vitest-environment jsdom
/**
 * Arrival is not the end of the picture.
 *
 * When the spacecraft reaches orbit the simulation has nothing left to work out, so its state stops.
 * The map must not: the planets go on round the Sun at the clock scale shown on screen, and the
 * spacecraft goes round the planet it reached, which is moving with them. The one thing that must
 * stay still is the trail, because the path already flown is fixed in space.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { renderToString } from "react-dom/server";
import { MissionControl, MissionView } from "../MissionControl";
import { useGame } from "../../store/gameStore";
import { createSimulation, step, type SimState } from "../../sim/simulation";
import { runChecks, findScenario, type Design } from "../../physics/checks";

const noop = () => {};
const MARS: Design = { bodyId: "small", instrumentIds: ["camera"], powerId: "solarSmall", antennaId: "antLarge", engineId: "chemical", rocketId: "light", fuelKg: 1800 };
const MOON: Design = { bodyId: "small", instrumentIds: ["camera", "magnetometer"], powerId: "solarSmall", antennaId: "antSmall", engineId: "chemical", rocketId: "medium", fuelKg: 1400 };

/** Fly a mission with no challenges all the way to orbit. */
function arrive(design: Design, scenarioId: string): SimState {
  const sc = findScenario(scenarioId);
  const month = sc.preset.launchMonth;
  let s = createSimulation(design, sc, month, "slow", runChecks(design, sc, month, "slow"), 1, []);
  for (let i = 0; i < 2000 && s.phase !== "orbit" && s.phase !== "failed"; i++) s = step(s, s.totalDays / 50);
  expect(s.phase).toBe("orbit");
  return s;
}

function html(sim: SimState, design: Design, coastDays: number): string {
  return renderToString(
    <MissionView sim={sim} design={design} speed={1} onSpeed={noop} fx={{ arrival: null, flash: null, countdown: null, burning: false }}
      instruments={["Camera"]} clockOffset={0} clockFlash={false} shake={false} secondsLeft={null}
      contextOpen={false} onToggleContext={noop} openInfo={null} onOpenInfo={noop} spaceView={false} onToggleSpace={noop}
      coastDays={coastDays} onDecide={noop} onSeeResults={noop} />,
  );
}

/** The centre of a drawn circle, by its class. */
function at(svg: string, cls: string): { x: number; y: number } {
  const tag = svg.match(new RegExp(`<circle[^>]*class="${cls}"[^>]*>`))!;
  expect(tag, `no circle with class ${cls}`).toBeTruthy();
  return { x: Number(tag[0].match(/cx="([-\d.]+)"/)![1]), y: Number(tag[0].match(/cy="([-\d.]+)"/)![1]) };
}
/** Where the spacecraft's orbit is drawn: the translate on the orbit group. */
function orbitAt(svg: string): { x: number; y: number } {
  const m = svg.match(/data-effect="orbit-captured" transform="translate\(([-\d.]+) ([-\d.]+)\)"/)!;
  expect(m, "the spacecraft is not shown in orbit").toBeTruthy();
  return { x: Number(m[1]), y: Number(m[2]) };
}
const moved = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
/** The trail, point by point. */
const trail = (svg: string) => svg.match(/class="trail" points="([^"]*)"/)![1].split(" ");

describe("the planets go on moving after the mission is over", () => {
  const mars = arrive(MARS, "mars");
  const still = html(mars, MARS, 0);
  const later = html(mars, MARS, 40);

  it("moves Mars and Earth on along their orbits", () => {
    expect(moved(at(later, "planet target"), at(still, "planet target"))).toBeGreaterThan(4);
    expect(moved(at(later, "planet earth"), at(still, "planet earth"))).toBeGreaterThan(4);
  });

  it("keeps the spacecraft in orbit around the planet, wherever the planet has got to", () => {
    // the transform is rounded to a tenth of a map unit, so "the same place" is to within that
    expect(moved(orbitAt(still), at(still, "planet target"))).toBeLessThan(0.1);
    expect(moved(orbitAt(later), at(later, "planet target"))).toBeLessThan(0.1);
  });

  it("draws the orbit the spacecraft is riding, so it reads as going round and not drifting past", () => {
    expect(later).toContain('class="parking-orbit"');
  });

  it("leaves the Sun and every step already flown exactly where they are", () => {
    expect(at(later, "sun-core")).toEqual(at(still, "sun-core"));
    const flown = trail(still);
    expect(trail(later).slice(0, flown.length)).toEqual(flown); // the path already flown is fixed in space
  });

  it("carries the trail on round the planet's orbit, so the spacecraft is never cut off from its own path", () => {
    // in orbit the spacecraft goes where the planet goes, so the path it is riding is the planet's orbit
    const points = trail(later);
    expect(points.length).toBeGreaterThan(trail(still).length);
    const end = points[points.length - 1].split(",").map(Number);
    expect(moved({ x: end[0], y: end[1] }, at(later, "planet target"))).toBeLessThan(1);
  });

  it("says on the map how long the spacecraft has been in orbit, which is why the sky is moving", () => {
    expect(still).not.toContain('data-effect="in-orbit"');
    expect(html(mars, MARS, 1).match(/In orbit for 1 day[^s]/), "one day should not be plural").toBeTruthy();
    expect(later).toContain("In orbit for 40 days");
    // it goes by the scale bar, not in the top strip, where the status line needs every pixel it has
    expect(later.indexOf('data-effect="in-orbit"')).toBeGreaterThan(later.indexOf("<svg"));
  });
});

describe("a Moon mission coasts around the Earth at the centre of the map", () => {
  const moon = arrive(MOON, "moon");

  it("carries the Moon on round Earth and the spacecraft round the Moon", () => {
    const still = html(moon, MOON, 0);
    const later = html(moon, MOON, 7);
    expect(moved(at(later, "planet target"), at(still, "planet target"))).toBeGreaterThan(4);
    expect(moved(orbitAt(later), at(later, "planet target"))).toBeLessThan(0.1);
    expect(at(later, "planet earth")).toEqual(at(still, "planet earth")); // Earth is the centre here
  });
});

describe("the screen keeps the sky turning by itself", () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;
  let frames: FrameRequestCallback[] = [];

  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    root = null;
    host = null;
    frames = [];
    vi.unstubAllGlobals();
  });

  /** Mount the real screen with a mission that has already arrived, and take over the frame clock. */
  function mount(sim: SimState): HTMLDivElement {
    frames = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal("cancelAnimationFrame", noop);
    const g = useGame.getState();
    g.reset();
    g.pickScenario("mars");
    g.loadPreset();
    g.startMission();
    useGame.setState({ sim });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(<MissionControl />));
    return host;
  }
  /** Run `n` frames a tenth of a second apart, as a browser would. */
  function run(n: number) {
    for (let i = 0; i < n; i++) {
      const next = frames.pop();
      frames = [];
      if (!next) break;
      act(() => next(performance.now() + 100 * (i + 1)));
    }
  }
  const planet = () => host!.querySelector("circle.planet.target")!.getAttribute("cx")!;

  it("moves the planet on its own, frame after frame, once the mission has ended", () => {
    mount(arrive(MARS, "mars"));
    const start = planet();
    run(60);
    expect(planet()).not.toBe(start);
    expect(host!.textContent).toMatch(/In orbit for \d+ days/);
  });

  it("holds still for a player who asked for less motion", () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: /prefers-reduced-motion/.test(q), media: q, addEventListener: noop, removeEventListener: noop }));
    mount(arrive(MARS, "mars"));
    const start = planet();
    run(60);
    expect(planet()).toBe(start);
    expect(host!.textContent).not.toMatch(/In orbit for/);
  });
});
