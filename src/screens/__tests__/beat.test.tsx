// @vitest-environment jsdom
/**
 * Stage 12 Part 3: two seconds of it happening, then the card.
 *
 * The beat is theatre, and theatre must never get in the way. It blocks nothing: a click or Escape
 * skips straight to the card, a player who asked for less motion never sees it, and one who turns
 * animations off never sees it again. Above all it costs no mission time — the engine stops the
 * clock the moment a challenge arrives, so the day is the same whether the beat plays or not.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { MissionControl } from "../MissionControl";
import { useGame } from "../../store/gameStore";
import { beatFor } from "../../sim/context";
import { createSimulation, step, EVENT_DEFS } from "../../sim/simulation";
import { runChecks, findScenario } from "../../physics/checks";
import settings from "../../data/settings.json";

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  useGame.setState({ skipAnimations: false });
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** The real screen, with a challenge waiting on day 1. */
function mount(eventId = "dust"): HTMLDivElement {
  const g = useGame.getState();
  g.reset();
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
const beatPlaying = () => host!.querySelector("[data-beat]") !== null;
const cardOpen = () => host!.querySelector(".modal.card") !== null;
const day = () => useGame.getState().sim!.missionDay;

describe("every challenge has a beat of its own", () => {
  it("names one for each event, with a plain alert for anything not named", () => {
    for (const def of EVENT_DEFS) expect(beatFor(def.id), def.id).toBeTruthy();
    expect(beatFor("dust")).toBe("dust");
    expect(beatFor("debris")).toBe("rock");
    expect(beatFor("lostSignal")).toBe("dish");
    expect(beatFor("solarStorm")).toBe("flare");
    expect(beatFor("bonusTarget")).toBe("chance");
    expect(beatFor("nothingLikeThis")).toBe("alert");
  });

  it("gives an opportunity a different beat from a problem, so the good news looks like good news", () => {
    expect(beatFor("bonusTarget")).not.toBe(beatFor("dust"));
  });
});

describe("the beat plays, then the card opens", () => {
  it("shows the beat first and holds the card back, then opens the card by itself", () => {
    vi.useFakeTimers();
    mount("dust");
    expect(beatPlaying()).toBe(true);
    expect(cardOpen()).toBe(false);
    act(() => void vi.advanceTimersByTime(settings.beatMs + 20));
    expect(beatPlaying()).toBe(false);
    expect(cardOpen()).toBe(true);
  });

  it("draws the beat for the challenge that actually arrived", () => {
    mount("lostSignal");
    expect(host!.querySelector("[data-beat]")!.getAttribute("data-beat")).toBe("dish");
  });

  it("never gets in the way of input: a click anywhere skips straight to the card", () => {
    mount("dust");
    expect(cardOpen()).toBe(false);
    act(() => window.dispatchEvent(new Event("pointerdown")));
    expect(beatPlaying()).toBe(false);
    expect(cardOpen()).toBe(true);
  });

  it("skips to the card on Escape too, and Escape does not leave space view while it is playing", () => {
    mount("dust");
    const screen = () => host!.querySelector(".mission-screen")!.className;
    act(() => host!.querySelector<HTMLButtonElement>("button.fullscreen")!.click());
    expect(screen()).toContain("space");
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(cardOpen()).toBe(true);
    expect(screen(), "the first Escape skipped the beat, it did not leave space view").toContain("space");
  });
});

describe("the beat is never the price of playing", () => {
  it("opens the card at once for a player who asked for less motion", () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: /prefers-reduced-motion/.test(q), media: q, addEventListener: () => {}, removeEventListener: () => {} }));
    mount("dust");
    expect(beatPlaying()).toBe(false);
    expect(cardOpen()).toBe(true);
  });

  it("opens the card at once once animations are turned off, and the toggle says so", () => {
    mount("dust");
    const button = host!.querySelector<HTMLButtonElement>("button.animations")!;
    expect(button.getAttribute("aria-pressed")).toBe("true");
    act(() => button.click());
    expect(useGame.getState().skipAnimations).toBe(true);
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(beatPlaying()).toBe(false);
    expect(cardOpen()).toBe(true);
  });

  it("costs the mission not one day, whether it plays, is skipped, or never runs", () => {
    // the engine stops the clock the moment a challenge arrives, so all three end on the same day
    vi.useFakeTimers();
    mount("dust");
    const arrived = day();
    act(() => void vi.advanceTimersByTime(settings.beatMs + 500)); // watched all the way through
    const watched = day();
    act(() => root!.unmount());
    host!.remove();

    mount("dust");
    act(() => window.dispatchEvent(new Event("pointerdown"))); // skipped straight away
    const skipped = day();
    act(() => root!.unmount());
    host!.remove();

    useGame.setState({ skipAnimations: true });
    mount("dust");
    const never = day();

    expect(watched).toBe(arrived);
    expect(skipped).toBe(arrived);
    expect(never).toBe(arrived);
  });

  it("hands the keyboard the first option when the card opens, which is after the beat, not before", () => {
    vi.useFakeTimers();
    mount("dust");
    expect(host!.querySelector(".option")).toBe(null); // nothing to focus while the beat is playing
    act(() => void vi.advanceTimersByTime(settings.beatMs + 20));
    expect(document.activeElement).toBe(host!.querySelector(".option"));
  });

  it("gives the player the whole decision countdown from the moment the card is in front of them", () => {
    vi.useFakeTimers();
    mount("dust");
    act(() => void vi.advanceTimersByTime(settings.beatMs + 20));
    expect(host!.querySelector(".countdown")!.textContent).toBe(`Decide in ${settings.decisionSeconds} s`);
  });
});
