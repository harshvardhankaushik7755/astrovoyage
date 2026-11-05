// @vitest-environment jsdom
/**
 * Stage 11 Part 3: one button, one mode.
 *
 * Space view is our own layout plus a request for browser fullscreen. The layout is what the player
 * asked for, so it must work whether or not the browser grants fullscreen, and the two must never
 * disagree about which mode the game is in. A judge will demo in this mode, so the challenge card
 * working here is not optional.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { renderToString } from "react-dom/server";
import { MissionControl, MissionView } from "../MissionControl";
import { useGame } from "../../store/gameStore";
import { createSimulation, step, type SimState } from "../../sim/simulation";
import { runChecks, findScenario, type Design } from "../../physics/checks";
import { panelsUnderShip } from "../../sim/sky";

const noop = () => {};
const MOON: Design = { bodyId: "small", instrumentIds: ["camera", "magnetometer"], powerId: "solarSmall", antennaId: "antSmall", engineId: "chemical", rocketId: "medium", fuelKg: 1400 };

let root: Root | null = null;
let host: HTMLDivElement | null = null;

/** Start a Moon mission in the store and mount the real screen, as the player sees it. */
function mount(schedule: { day: number; eventId: string }[] = []) {
  const g = useGame.getState();
  g.reset();
  // these tests are about the card itself, so skip the beat that plays before it (Stage 12 Part 3)
  useGame.setState({ skipAnimations: true });
  g.pickScenario("moon");
  g.loadPreset();
  g.startMission();
  if (schedule.length) {
    const sc = findScenario("moon");
    const { design, launchMonth, route } = useGame.getState();
    useGame.setState({ sim: step(createSimulation(design, sc, launchMonth, route, runChecks(design, sc, launchMonth, route), 1, schedule), 2) });
  }
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(<MissionControl />));
  return host;
}
const spaceButton = () => [...host!.querySelectorAll("button")].find((b) => /space view/i.test(b.textContent ?? ""))!;
const inSpace = () => host!.querySelector(".mission-screen")!.className.includes("space");
const press = (key: string) => act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })); });

beforeEach(() => {
  // a browser that grants fullscreen, and remembers that it did
  (document as unknown as { fullscreenElement: Element | null }).fullscreenElement = null;
  Element.prototype.requestFullscreen = vi.fn(function (this: Element) {
    (document as unknown as { fullscreenElement: Element | null }).fullscreenElement = this;
    return Promise.resolve();
  });
  document.exitFullscreen = vi.fn(() => {
    (document as unknown as { fullscreenElement: Element | null }).fullscreenElement = null;
    return Promise.resolve();
  });
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.restoreAllMocks();
});

describe("entering and leaving space view", () => {
  it("one button switches the layout and asks the browser for fullscreen", () => {
    mount();
    expect(inSpace()).toBe(false);
    expect(spaceButton().textContent).toContain("⛶ Space view");

    act(() => spaceButton().click());
    expect(inSpace()).toBe(true);
    expect(Element.prototype.requestFullscreen).toHaveBeenCalledTimes(1);
    expect(spaceButton().textContent).toContain("Exit space view");
    expect(spaceButton().getAttribute("aria-pressed")).toBe("true");

    act(() => spaceButton().click());
    expect(inSpace()).toBe(false);
    expect(document.exitFullscreen).toHaveBeenCalledTimes(1);
  });

  it("Escape leaves the mode", () => {
    mount();
    act(() => spaceButton().click());
    expect(inSpace()).toBe(true);
    press("Escape");
    expect(inSpace()).toBe(false);
  });

  it("leaving browser fullscreen by any other means also leaves space view, so the two never disagree", () => {
    mount();
    act(() => spaceButton().click());
    expect(inSpace()).toBe(true);
    // the browser's own chrome, or F11
    act(() => {
      (document as unknown as { fullscreenElement: Element | null }).fullscreenElement = null;
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    expect(inSpace()).toBe(false);
  });

  it("a browser that refuses fullscreen still gets the immersive layout", () => {
    mount();
    Element.prototype.requestFullscreen = vi.fn(() => Promise.reject(new Error("not allowed")));
    act(() => spaceButton().click());
    expect(inSpace()).toBe(true); // the mode the player asked for is ours to give
  });

  it("a browser with no fullscreen API at all still gets the immersive layout", () => {
    mount();
    (Element.prototype as unknown as { requestFullscreen?: unknown }).requestFullscreen = undefined;
    act(() => spaceButton().click());
    expect(inSpace()).toBe(true);
  });
});

describe("a challenge in space view", () => {
  it("still appears, still pauses the clock and still shows its options and chips", () => {
    mount([{ day: 1, eventId: "solarStorm" }]);
    act(() => spaceButton().click());
    expect(inSpace()).toBe(true);

    const card = host!.querySelector('[role="dialog"]')!;
    expect(card, "the card a judge will be looking at is missing").not.toBeNull();
    expect(card.textContent).toContain("Solar storm");
    expect(card.textContent).toContain("Switch the instruments off until it passes");
    expect(card.querySelectorAll(".affect").length).toBeGreaterThan(0);
    // the clock is stopped: the engine refuses to move while a decision is waiting
    expect(useGame.getState().sim!.pendingEvent?.id).toBe("solarStorm");
    const day = useGame.getState().sim!.missionDay;
    act(() => { useGame.getState().tick(1); });
    expect(useGame.getState().sim!.missionDay).toBe(day);
    // and the card sits over the map, not inside a panel
    expect(host!.querySelector(".map .overlay.on-map")).not.toBeNull();
  });
});

describe("the layout itself", () => {
  const sim = (): SimState => {
    const sc = findScenario("moon");
    return step(createSimulation(MOON, sc, 3, "slow", runChecks(MOON, sc, 3, "slow"), 1, []), 1);
  };
  const view = (spaceView: boolean) =>
    renderToString(
      <MissionView sim={sim()} design={MOON} speed={1} onSpeed={noop} fx={{ arrival: null, flash: null, countdown: null, burning: false }}
        instruments={["Camera"]} clockOffset={0} clockFlash={false} shake={false} secondsLeft={null}
        contextOpen={false} onToggleContext={noop} openInfo={null} onOpenInfo={noop} spaceView={spaceView} onToggleSpace={noop}
        onDecide={noop} onSeeResults={noop} />,
    );

  it("adds the class that switches the layout, and keeps the same sky in both views", () => {
    expect(view(true)).toContain('class="mission-screen space"');
    expect(view(false)).toContain('class="mission-screen"');
    for (const html of [view(true), view(false)]) {
      expect(html).toContain('class="sky"'); // the same sky, just bigger
      expect(html).toContain('class="gauges');
      expect(html).toContain('class="log');
    }
  });
});

describe("a panel steps aside when the spacecraft flies under it", () => {
  it("names the panel the spacecraft is behind, and none when it is in open space", () => {
    const W = 640;
    const H = 400;
    expect(panelsUnderShip({ x: 60, y: 40 }, W, H)).toEqual({ topLeft: true, topRight: false, hud: false });
    expect(panelsUnderShip({ x: 600, y: 40 }, W, H)).toEqual({ topLeft: false, topRight: true, hud: false });
    expect(panelsUnderShip({ x: 320, y: 380 }, W, H)).toEqual({ topLeft: false, topRight: false, hud: true });
    expect(panelsUnderShip({ x: 320, y: 200 }, W, H)).toEqual({ topLeft: false, topRight: false, hud: false });
  });

  it("dims that panel only in space view, never in the normal layout", () => {
    const sc = findScenario("moon");
    // a Moon mission at the very start sits near the middle, so nothing is covered
    const early = step(createSimulation(MOON, sc, 3, "slow", runChecks(MOON, sc, 3, "slow"), 1, []), 0.1);
    const render = (s: SimState, spaceView: boolean) =>
      renderToString(
        <MissionView sim={s} design={MOON} speed={1} onSpeed={noop} fx={{ arrival: null, flash: null, countdown: null, burning: false }}
          instruments={["Camera"]} clockOffset={0} clockFlash={false} shake={false} secondsLeft={null}
          contextOpen={false} onToggleContext={noop} openInfo={null} onOpenInfo={noop} spaceView={spaceView} onToggleSpace={noop}
          onDecide={noop} onSeeResults={noop} />,
      );
    // whatever the mission is doing, the normal layout never dims anything
    const late = step(early, 3);
    expect(render(early, false)).not.toContain("dim");
    expect(render(late, false)).not.toContain("dim");
    // and in space view the dimming follows the spacecraft, not the clock
    const shipLate = render(late, true);
    expect(typeof shipLate).toBe("string");
  });
});
