import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import settings from "../data/settings.json";
import view3d from "../data/view3d.json";
import { useGame } from "../store/gameStore";
import { ownerOfPart, say, TEAM_TEXT, type Player } from "../sim/team";
import { findScenario, getInstrument, runChecks, type Design } from "../physics/checks";
import {
  AU_KM, coastAngles, EARTH_ORBIT_AU, EVENT_DEFS, formatSignalDelay, riskLabel, safestOption, timeScale, transferPath,
  type Decision, type SimState,
} from "../sim/simulation";
import { decisionDeltas, gaugeMarks, type GaugeId } from "../sim/deltas";
import { affectsLabels, affectTone, beatFor, damageFor, eventContext, fillTarget, optionPart, protectionNote } from "../sim/context";
import { panelsOverMission, NOTHING_HIDDEN } from "../sim/sky";
import { scaleBar } from "../sim/mapScale";
import { Gauge, type GaugeInstrument, type InstrumentState } from "../components/Gauge";
import { ShipSchematic } from "../components/Spacecraft";
import { Beat } from "../components/Beat";
import { partName } from "../sim/shipLayout";
import { MapEffects, type Fx, type MapGeometry, type Pt } from "../components/MapEffects";
import { Starfield } from "../components/Starfield";
import { MuteButton } from "../components/MuteButton";
import { AnimationsButton } from "../components/AnimationsButton";
import { MissionSummary } from "../components/MissionSummary";
import { ProvenanceNote } from "../components/Provenance";
import { Timeline } from "../components/Timeline";
import { alertBeep, burnRoar, countdownTick, failTone, rumble, startHum, successChime, type Hum } from "../sound/sound";

/** How long the braking burn stays on screen, after the 3-2-1 countdown, before the engine settles it. */
const BURN_MS = settings.burnHoldMs;
const COUNTDOWN_MS = settings.insertionCountdownMs;
/** How long a decision's effects stay on screen. */
const EFFECT_MS = settings.effectMs;
const SHAKE_MS = settings.shakeMs;
const CLOCK_JUMP_MS = settings.clockJumpMs;
/** The 3D view (three.js) is downloaded only when the player first asks for it. */
const Flight3D = lazy(() => import("../components/three/Flight3D"));

/** How long the beat before a challenge card plays for. */
const BEAT_MS = settings.beatMs;
/** Seconds the player has to answer a challenge before mission control chooses. */
const COUNTDOWN_S = settings.decisionSeconds;
/** The map is landscape (16:10); the orbit scale fits the shorter side. */
const VIEW_W = 640;
const VIEW_H = 400;
/**
 * How much of the shorter side the widest orbit may use. 0.425 of a 400-high box is the 170 this map
 * has always used. Space view leaves more room, because the floating panels live around the edges.
 */
/** How much of the trip the fading lead ahead of the spacecraft covers. */
const LEAD_SHARE = 0.1;
const R_MAX_SHARE = 0.425;
const R_MAX_SHARE_SPACE = 0.34;
/** Viewports at least this tall show the challenge context open by default. */
const TALL_VIEWPORT = 800;
/**
 * One constant icon per gauge, so a readout in the HUD always carries the same symbol. These are the
 * gauges, not the challenges: the icons in src/sim/deltas.ts belong to events and must never be used
 * here, or a readout would change its symbol as the mission went along.
 */
export const GAUGE_ICON = {
  fuel: "⛽",
  power: "🔋",
  signal: "📶",
  delay: "⏱️",
  distance: "📏",
  science: "🔬",
} as const;

/** Green, amber, orange, red: the colour of the mission risk dot. */
const RISK_CLASS: Record<string, string> = { Low: "low", Medium: "medium", High: "high", "Very high": "very-high" };
export type Speed = 0 | 1 | 4;
export interface Flash { decision: Decision; index: number }

const reducedMotion = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Mission Control: plays the simulation from src/sim.
 * This container owns the animation loop, the speed buttons, the decision countdown and the timing of
 * the visual effects (what is shown for the two seconds after a decision, the 3-2-1 before the burn,
 * the clock jump). MissionView below is a pure function of the sim state and that timing, so it can be
 * tested without a browser.
 */
export function MissionControl() {
  const sim = useGame((s) => s.sim);
  const tick = useGame((s) => s.tick);
  const decide = useGame((s) => s.decide);
  const go = useGame((s) => s.go);
  const design = useGame((s) => s.design);
  const skipAnimations = useGame((s) => s.skipAnimations);
  const team = useGame((s) => s.team);
  const muted = useGame((s) => s.muted);
  const instrumentIds = design.instrumentIds;
  const [speed, setSpeed] = useState<Speed>(1);
  const [burning, setBurning] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [shake, setShake] = useState(false);
  // the clock jump rides on top of the live clock: the day shown is the live day minus lost × (1 − progress)
  const [jump, setJump] = useState<{ lost: number; p: number } | null>(null);
  const [clockFlash, setClockFlash] = useState(false);
  const [contextOpen, setContextOpen] = useState(() => typeof window !== "undefined" && window.innerHeight >= TALL_VIEWPORT);
  const [openInfo, setOpenInfo] = useState<number | null>(null);
  const [spaceView, setSpaceView] = useState(false);
  const [show3d, setShow3d] = useState(false);
  const [mapHeight, setMapHeight] = useState(VIEW_H);
  // days gone by since the mission ended: the sky keeps turning even though the mission is over
  const [coastDays, setCoastDays] = useState(0);
  // the challenge whose beat is playing over the map; the card waits until it is over
  const [beat, setBeat] = useState<string | null>(null);
  const beatOn = useRef(false);
  beatOn.current = beat !== null;
  const [showPlan, setShowPlan] = useState(false);
  const burnStart = useRef<number | null>(null);
  const countdownShown = useRef<number | null>(null);
  const seenDecisions = useRef(sim?.decisions.length ?? 0);

  const totalDays = sim?.totalDays ?? 0;
  const daysPerSecond = useMemo(() => (totalDays > 0 ? timeScale(totalDays).daysPerSecond : 0), [totalDays]);
  const hasSim = sim !== null;
  const over = sim?.phase === "orbit" || sim?.phase === "failed";
  const pendingKey = sim?.pendingEvent ? `${sim.pendingEvent.id}@${sim.pendingEvent.day}` : null;
  // the card is in front of the player once the beat is over; the countdown starts then, not before
  const cardKey = beat === null ? pendingKey : null;
  const decisionCount = sim?.decisions.length ?? 0;
  const instruments = useMemo(() => instrumentIds.map((id) => getInstrument(id).name), [instrumentIds]);

  // The clock: advance the mission every frame while cruising (the engine itself refuses to move while a
  // challenge is waiting). At arrival: a 3-2-1 countdown, then the burn on screen, then the engine settles it.
  useEffect(() => {
    if (!hasSim || over) return;
    let last = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000); // seconds since the last frame, capped after a tab switch
      last = now;
      const s = useGame.getState().sim;
      if (!s) return;
      if (s.phase === "cruise") {
        if (speed > 0 && !s.pendingEvent) tick(dt * daysPerSecond * speed);
      } else if (s.phase === "insertion") {
        if (burnStart.current === null) burnStart.current = now;
        const elapsed = now - burnStart.current;
        if (elapsed < COUNTDOWN_MS) {
          const n = 3 - Math.floor((elapsed / COUNTDOWN_MS) * 3);
          if (countdownShown.current !== n) {
            countdownShown.current = n;
            setCountdown(n);
            countdownTick(useGame.getState().muted, n === 1);
          }
        } else if (elapsed < COUNTDOWN_MS + BURN_MS) {
          if (countdownShown.current !== null) {
            countdownShown.current = null;
            setCountdown(null);
            setBurning(true);
          }
        } else {
          tick(0);
          setBurning(false);
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [hasSim, over, speed, daysPerSecond, tick]);

  // Sound while flying: a low hum for as long as the mission runs, softer when paused or a card is open
  // and a little higher at 4x; a roar for the arrival burn; a chime or a falling tone at the end.
  const hum = useRef<Hum | null>(null);
  useEffect(() => {
    if (!hasSim || over || muted) return;
    hum.current = startHum(muted);
    return () => {
      hum.current?.stop();
      hum.current = null;
    };
  }, [hasSim, over, muted]);
  useEffect(() => {
    hum.current?.setLevel(speed === 0 || pendingKey ? 0 : speed);
  }, [speed, pendingKey, muted]);
  useEffect(() => {
    if (burning) burnRoar(useGame.getState().muted, BURN_MS / 1000);
  }, [burning]);
  const phase = sim?.phase;
  const startPhase = useRef(phase);
  useEffect(() => {
    if (phase === startPhase.current) return; // a finished mission opened again plays nothing
    const quiet = useGame.getState().muted;
    if (phase === "orbit") successChime(quiet);
    else if (phase === "failed") failTone(quiet);
  }, [phase]);

  /**
   * After the mission ends, the solar system does not stop. The planets keep going round the Sun at the
   * same clock scale the cruise used, and the spacecraft rides round with the planet it reached, because
   * that is where it is: in orbit around a world that is itself moving. A player who asked for less
   * motion gets a still picture instead.
   */
  useEffect(() => {
    if (!hasSim || !over || reducedMotion()) return;
    let last = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      setCoastDays((d) => d + dt * daysPerSecond);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [hasSim, over, daysPerSecond]);

  /**
   * A challenge arrives: two seconds of it happening on the map, then the card. The engine has already
   * stopped the mission clock, so this costs no mission time; a click or Escape skips straight to the
   * card; and a player who asked for less motion, or turned animations off, never sees it at all.
   */
  useEffect(() => {
    if (!pendingKey) {
      setBeat(null);
      return;
    }
    const ev = useGame.getState().sim?.pendingEvent;
    // the beats are drawn on the flat map, so in 3D the card opens straight away
    if (!ev || skipAnimations || show3d || reducedMotion()) return;
    setBeat(ev.id);
    const skip = () => setBeat(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") skip(); };
    const timer = setTimeout(skip, BEAT_MS);
    window.addEventListener("pointerdown", skip);
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointerdown", skip);
      window.removeEventListener("keydown", onKey);
      setBeat(null);
    };
  }, [pendingKey, skipAnimations, show3d]);

  // The decision countdown: the player gets the full time from the moment the card is in front of them.
  useEffect(() => {
    if (!cardKey) {
      setSecondsLeft(null);
      return;
    }
    const deadline = Date.now() + COUNTDOWN_S * 1000;
    setSecondsLeft(COUNTDOWN_S);
    const state = useGame.getState();
    alertBeep(state.muted);
    if (state.sim?.pendingEvent?.id === "solarStorm") rumble(state.muted);
    let lastTicked = COUNTDOWN_S;
    const id = setInterval(() => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      // the last five seconds tick, the last three higher, so time running out can be heard
      if (left !== lastTicked && left > 0 && left <= 5) countdownTick(useGame.getState().muted, left <= 3);
      lastTicked = left;
      setSecondsLeft(left);
      if (left <= 0) {
        clearInterval(id);
        const ev = useGame.getState().sim?.pendingEvent;
        if (ev) decide(safestOption(ev).id, true);
      }
    }, 250);
    return () => clearInterval(id);
  }, [cardKey, decide]);

  // The moment of a decision: show its effects for a couple of seconds, shake on a gamble, and when the
  // decision cost mission days, count the clock forward like a delay board.
  useEffect(() => {
    if (!sim || decisionCount <= seenDecisions.current) {
      seenDecisions.current = decisionCount;
      return;
    }
    seenDecisions.current = decisionCount;
    const decision = sim.decisions[decisionCount - 1];
    setFlash({ decision, index: decisionCount - 1 });
    const timers = [setTimeout(() => setFlash(null), EFFECT_MS)];
    let raf = 0;
    if (decision.eventId === "solarStorm" && decision.optionId === "risky") {
      setShake(true);
      timers.push(setTimeout(() => setShake(false), SHAKE_MS));
    }
    const lost = decision.effect.daysLost ?? 0; // the engine records the days really lost, never past the end
    if (lost > 0) {
      setClockFlash(true);
      if (reducedMotion()) {
        timers.push(setTimeout(() => setClockFlash(false), EFFECT_MS));
      } else {
        const start = performance.now();
        const count = (now: number) => {
          const p = Math.min(1, (now - start) / CLOCK_JUMP_MS);
          if (p < 1) {
            setJump({ lost, p });
            raf = requestAnimationFrame(count);
          } else {
            setJump(null);
            setClockFlash(false);
          }
        };
        raf = requestAnimationFrame(count);
      }
    }
    return () => {
      timers.forEach(clearTimeout);
      cancelAnimationFrame(raf);
      setJump(null);
      setClockFlash(false);
      setShake(false);
    };
  }, [decisionCount]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * In space view the map box takes the shape of the window, so the sky reaches every edge and nothing
   * is cropped. The orbit scale is fitted to the shorter side, so a wider window simply shows more sky.
   */
  useEffect(() => {
    if (!spaceView || typeof window === "undefined") {
      setMapHeight(VIEW_H);
      return;
    }
    const fit = () => setMapHeight(Math.round(Math.min(900, Math.max(280, (VIEW_W * window.innerHeight) / window.innerWidth))));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [spaceView]);

  // Space view and browser fullscreen are one mode to the player, so they must never disagree:
  // leaving fullscreen by any means (Escape, the browser's own chrome, F11) also leaves space view.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onChange = () => {
      if (document.fullscreenElement === null) setSpaceView(false);
    };
    const onKey = (e: KeyboardEvent) => {
      // Escape closes space view even where the browser never gave us fullscreen to close — unless a
      // beat is playing, where the first Escape is the player skipping it
      if (e.key === "Escape" && !beatOn.current) setSpaceView(false);
    };
    document.addEventListener("fullscreenchange", onChange);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  if (!sim) {
    return (
      <div className="center">
        <h2>No mission is flying</h2>
        <button className="primary" onClick={() => go("design")}>Go to the Design Lab</button>
      </div>
    );
  }
  const fx: Fx = { arrival: sim.pendingEvent?.id ?? null, flash, countdown, burning };
  const clockOffset = jump ? jump.lost * (1 - jump.p) : 0;
  /**
   * One button, one mode. The immersive layout is ours and always works; browser fullscreen is a bonus
   * we ask for and never depend on, because a browser may refuse it (in an iframe, or without a gesture)
   * and a refused request must not leave the player stuck outside the mode they asked for.
   */
  const toggleSpaceView = () => {
    const goingIn = !spaceView;
    setSpaceView(goingIn);
    if (typeof document === "undefined") return;
    const root = document.querySelector("main.app") ?? document.documentElement;
    const done = goingIn ? root.requestFullscreen?.() : document.fullscreenElement ? document.exitFullscreen?.() : undefined;
    void Promise.resolve(done).catch(() => undefined);
  };
  return (
    <MissionView sim={sim} design={design} speed={speed} onSpeed={setSpeed} fx={fx} instruments={instruments} clockOffset={clockOffset}
      clockFlash={clockFlash} shake={shake} secondsLeft={secondsLeft} contextOpen={contextOpen}
      onToggleContext={() => setContextOpen((v) => !v)} openInfo={openInfo} onOpenInfo={setOpenInfo}
      spaceView={spaceView} onToggleSpace={toggleSpaceView} mapHeight={mapHeight} coastDays={coastDays}
      showPlan={showPlan} onTogglePlan={() => setShowPlan((v) => !v)} beat={beat}
      show3d={show3d} onToggle3d={() => setShow3d((v) => !v)}
      team={team} onDecide={(id) => decide(id)} onSeeResults={() => go("result")} />
  );
}

/** The science readout. A chance taken can bring home more than the plan asked for, and it says so. */
export function scienceValue(collected: number, planned: number): string {
  return collected > planned
    ? `${collected} points · ${collected - planned} more than planned`
    : `${collected} of ${planned} points`;
}

/** Which instrument chip shows what, from the sim state and the effect in progress. */
export function instrumentStates(names: string[], sim: SimState, fx: Fx): GaugeInstrument[] {
  const flash = fx.flash?.decision;
  const dead = sim.decisions.some((d) => d.eventId === "instrumentFault" && d.optionId === "accept");
  return names.map((name, i) => {
    let state: InstrumentState = "ok";
    if (i === 0) {
      if (fx.arrival === "instrumentFault") state = "fault";
      else if (flash?.eventId === "instrumentFault") state = flash.optionId === "auto" ? "backup" : flash.optionId === "accept" ? "dead" : "ok";
      else if (dead) state = "dead";
    }
    if (state === "ok" && flash?.eventId === "solarStorm" && flash.optionId === "safe") state = "off";
    return { name, state };
  });
}

/** The status line, as an icon plus a short sentence. */
function statusOf(sim: SimState, fx: Fx, speed: Speed, target: string): { cls: string; icon: string; text: string } {
  const lastLine = sim.log.length ? sim.log[sim.log.length - 1].text : "";
  const ev = sim.pendingEvent;
  if (sim.phase === "failed") return { cls: "bad", icon: "✖", text: lastLine };
  if (sim.phase === "orbit") return { cls: "ok", icon: "✔", text: lastLine };
  // a waiting card always wins: the player must answer it before anything else happens
  if (ev) {
    return ev.kind === "opportunity"
      ? { cls: "ok", icon: "★", text: `Paused: ${ev.name}. Take the chance, or stay on plan.` }
      : { cls: "warn", icon: "⚠", text: `Paused: ${ev.name}. Decide what to do.` };
  }
  if (sim.phase === "insertion") return { cls: "burn", icon: "🔥", text: fx.countdown !== null ? `Braking burn in ${fx.countdown}…` : "Orbit insertion burn: firing the engine to slow down." };
  return { cls: "", icon: speed === 0 ? "⏸" : "🛰", text: speed === 0 ? `Paused on the way to ${target}.` : `Cruising to ${target}.` };
}

/** Everything on the Mission Control screen, drawn from the sim state and the effect timing. */
export function MissionView({
  sim, design, speed, onSpeed, fx, instruments, clockOffset, clockFlash, shake, secondsLeft, contextOpen, onToggleContext,
  openInfo, onOpenInfo, spaceView = false, onToggleSpace, mapHeight = VIEW_H, coastDays = 0,
  showPlan = false, onTogglePlan = () => {}, beat = null, team = null, show3d = false, onToggle3d = () => {}, onDecide, onSeeResults,
}: {
  /** The map drawn in 3D instead of flat. Same flight, same numbers. */
  show3d?: boolean;
  onToggle3d?: () => void;
  /** Team mode: the challenge goes to the player who owns the part it happens to. */
  team?: Player[] | null;
  sim: SimState; design: Design; speed: Speed; onSpeed: (s: Speed) => void; fx: Fx; instruments: string[];
  openInfo: number | null; onOpenInfo: (i: number | null) => void; spaceView?: boolean; onToggleSpace: () => void;
  /** The map box in SVG units. In space view it matches the window, so the sky reaches every edge. */
  mapHeight?: number;
  /** Days since the mission ended: the planets go on moving, and the spacecraft goes round with them. */
  coastDays?: number;
  /** The id of the challenge whose beat is playing over the map. The card waits until it is over. */
  beat?: string | null;
  /** Off by default: the planned path is what the plan says, not a promise the engine has kept. */
  showPlan?: boolean;
  onTogglePlan?: () => void;
  clockOffset: number; clockFlash: boolean; shake: boolean; secondsLeft: number | null;
  contextOpen: boolean; onToggleContext: () => void;
  onDecide: (optionId: string) => void; onSeeResults: () => void;
}) {
  const c = sim.config;
  const scenario = findScenario(c.scenarioId);
  const scale = timeScale(sim.totalDays);
  const path = useMemo(() => transferPath(c, 200), [c]);
  // in space view the panels float over the map, so a panel the spacecraft is passing under steps aside
  const hiding = spaceView
    ? panelsOverMission(mapGeometry(sim, path, VIEW_W, mapHeight, R_MAX_SHARE_SPACE, coastDays), VIEW_W, mapHeight)
    : NOTHING_HIDDEN;
  const over = sim.phase === "orbit" || sim.phase === "failed";
  const ev = sim.pendingEvent;
  // the card takes focus when it is actually in front of the player, which is after the beat, not before
  const eventKey = ev && !beat ? `${ev.id}@${ev.day}` : null;
  const firstOption = useRef<HTMLButtonElement>(null);
  const statusRef = useRef<HTMLSpanElement>(null);
  // the option the mouse or the keyboard is on, so the schematic can point at what it would change
  const [pointed, setPointed] = useState<string | null>(null);
  const hadEvent = useRef(false);
  const infoButtons = useRef<Record<number, HTMLButtonElement | null>>({});
  const popover = useRef<HTMLDivElement>(null);
  // keyboard and screen-reader users: focus the challenge card when it opens, and the status line when it closes
  useEffect(() => {
    if (eventKey) {
      firstOption.current?.focus();
      hadEvent.current = true;
    } else if (hadEvent.current) {
      statusRef.current?.focus();
      hadEvent.current = false;
    }
  }, [eventKey]);
  // the log popover: move focus into it when it opens, and back to its ℹ button when it closes
  useEffect(() => {
    if (openInfo !== null) popover.current?.focus();
  }, [openInfo]);
  const closeInfo = (i: number | null) => {
    onOpenInfo(null);
    if (i !== null) infoButtons.current[i]?.focus();
  };

  const status = statusOf(sim, fx, speed, scenario.targetProse);
  const arrivalRisk = sim.phase === "cruise" && sim.insertionRisk > 0
    ? `⚠ ${Math.round(sim.insertionRisk * 10)} in 10 chance of missing ${scenario.targetProse} at arrival`
    : null;

  const km = sim.distanceFromEarthAU * AU_KM;
  const distance = km < 1e6 ? `${Math.round(km).toLocaleString()} km` : `${(km / 1e6).toFixed(1)} million km`;
  // in the HUD every readout is one short line: a name, a number and its unit, and nothing that wraps
  const short = <T,>(hud: T, normal: T) => (spaceView ? hud : normal);
  const maxDistanceAU = c.centralBody === "earth" ? c.targetOrbitRadiusAU : c.targetOrbitRadiusAU + EARTH_ORBIT_AU;
  const powerAtLaunch = c.powerSource.powerAt1AU;
  const day = Math.max(0, sim.missionDay - clockOffset);

  // cause and effect on the gauges
  const deltas = fx.flash ? decisionDeltas(fx.flash.decision) : [];
  const marks = gaugeMarks(sim.decisions);
  const deltaFor = (gauge: GaugeId) => deltas.find((d) => d.gauge === gauge) ?? null;
  const marksFor = (gauge: GaugeId) => marks.filter((m) => m.gauge === gauge);
  const deltaKey = fx.flash?.index;
  const signalLost = fx.arrival === "lostSignal";
  const clockDelta = deltaFor("clock");

  // the challenge is happening to a part of the spacecraft: the card points at it, and pointing at an
  // option points at the part that option would change instead
  const pointedOption = ev && pointed ? ev.options.find((o) => o.id === pointed) : undefined;
  const pointedAt = pointedOption ? optionPart(pointedOption.effect, ev!.affectsPart) : null;

  // context for the card (what is it, real story, how common) and the option chips
  const def = ev ? EVENT_DEFS.find((e) => e.id === ev.id) : undefined;
  const context = ev ? eventContext(ev.id) : null;
  const caller = ev && team ? ownerOfPart(team, ev.affectsPart) : null;
  const chipsFor = (effect: Decision["effect"], shielded: boolean) =>
    affectsLabels(effect, shielded ? protectionNote(def?.protectedBy) : undefined).map((l) => fillTarget(l, scenario.targetProse));
  // the log: which lines are challenges ("Solar storm! ..."), so they can carry an ℹ button
  const logEvent = (text: string) => EVENT_DEFS.find((e) => text.startsWith(`${e.name}!`));

  // the spacecraft the player built, with the fuel figure the simulation is using right now
  const check = useMemo(() => runChecks(design, scenario, c.launchMonth, c.route, c.plan), [design, scenario, c.launchMonth, c.route, c.plan]);
  const fuelChanged = fx.flash && (fx.flash.decision.effect.fuelCost || fx.flash.decision.effect.fuelSaved);
  const fuelKey = fuelChanged ? fx.flash!.index : "";

  // the one number that says how much has been gambled so far
  const risk = riskLabel(sim.riskTaken);
  const riskClass = RISK_CLASS[risk];
  const riskJust = fx.flash !== null && !!(fx.flash.decision.effect.riskOfFailure || fx.flash.decision.effect.riskAtInsertion);

  return (
    <div className={"mission-screen" + (spaceView ? " space" : "")}>
      <div className={"topbar cockpit-bar" + (hiding.topLeft ? " dim" : "")}>
        <h2>Mission Control <small className="muted">· {scenario.name}</small></h2>
        <span ref={statusRef} tabIndex={-1} aria-live="polite" className={"status " + status.cls}>
          <span aria-hidden="true">{status.icon}</span> <span className="status-text">{status.text}</span>
          {arrivalRisk && <span className="chip warn" data-effect="arrival-risk">{arrivalRisk}</span>}
        </span>
        <span className={"clock" + (clockFlash ? " jump" : "")}>
          <b>{`Day ${Math.floor(day)} of ${sim.totalDays}`}</b> · {scale.label}
          {clockDelta && <span key={deltaKey} className="delta loss" role="status">{clockDelta.label}</span>}
        </span>
        <span key={`risk-${sim.decisions.length}`} className={"risk " + riskClass + (riskJust ? " bump" : "")}
          tabIndex={0} role="note"
          aria-label={`Mission risk: ${risk}. Every risky choice adds to this. It is the chance something goes wrong before you arrive.`}>
          <span className="dot" aria-hidden="true" />
          Mission risk: <b>{risk}</b>
          <span className="mark-tip" aria-hidden="true">Every risky choice adds to this. It is the chance something goes wrong before you arrive.</span>
        </span>
        <span className="controls row">
          {over && <button className="primary" onClick={onSeeResults}>See results →</button>}
          {/* the one control a player needs all the time, drawn as a single joined switch */}
          <span className="speed seg" role="group" aria-label="Speed">
            <span className="seg-label" aria-hidden="true">Speed</span>
            {([0, 1, 4] as Speed[]).map((v) => (
              <button key={v} className={speed === v ? "on" : ""} aria-pressed={speed === v} disabled={over} onClick={() => onSpeed(v)}
                title={v === 0 ? "Stop the clock" : v === 1 ? "Normal speed" : "Four times faster"}>
                {v === 0 ? "⏸ Pause" : v === 1 ? "▶ 1x" : "⏩ 4x"}
              </button>
            ))}
          </span>
          {/* settings for how it looks and sounds: quieter, so they do not compete with the speed */}
          <span className="view-toggles row" role="group" aria-label="View options">
            <button className={"toggle-3d" + (show3d ? " on" : "")} onClick={onToggle3d} aria-pressed={show3d}
              title={show3d ? "Go back to the flat map" : "See the whole flight in 3D"}>
              {show3d ? view3d.text.buttonOff : view3d.text.button}
            </button>
            <MuteButton />
            <AnimationsButton />
            <button className="fullscreen" onClick={onToggleSpace} aria-pressed={spaceView}
              aria-label={spaceView ? "Exit space view (or press Escape)" : "Space view: fill the screen with the map"}>
              {spaceView ? "⛶ Exit space view" : "⛶ Space view"}
            </button>
          </span>
        </span>
        <span className="ship-row">
          <MissionSummary design={design} scenario={scenario} check={check} fuelKg={sim.fuelKg} fuelKey={fuelKey} />
          <Timeline sim={sim} />
        </span>
      </div>

      <div className="cockpit">
        <div className={"map" + (shake ? " shake" : "") + (fx.arrival === "solarStorm" ? " storm" : "")}>
          {show3d ? (
            <Suspense fallback={<div className="view3d loading" style={{ aspectRatio: `${VIEW_W} / ${mapHeight}` }}><p>{view3d.text.loading}</p></div>}>
              <Flight3D sim={sim} design={design} path={path} coastDays={coastDays} burning={fx.burning} viewW={VIEW_W} viewH={mapHeight} />
            </Suspense>
          ) : (
            <FlightMap sim={sim} design={design} path={path} target={scenario.target} color={scenario.color} fx={fx} viewH={mapHeight}
              spaceView={spaceView} showPlan={showPlan} coastDays={coastDays} beat={beat} />
          )}

          {ev && !beat && (
            <div className="overlay on-map" role="dialog" aria-labelledby="event-title">
              <div className={"modal card" + (ev.kind === "opportunity" ? " opportunity" : "")}>
                <div className="row between">
                  <span className="row tags">
                    <span className="kindTag">{ev.kind === "opportunity" ? "★ Opportunity" : "⚠ Challenge"}</span>
                    <span className="tag">{`Day ${ev.day}`}</span>
                    {context?.howCommon && <span className="tag common">{context.howCommon}</span>}
                  </span>
                  <span className="countdown">{`Decide in ${secondsLeft ?? COUNTDOWN_S} s`}</span>
                </div>
                <h3 id="event-title">{ev.name}</h3>
                {/* the machine on the left, what to do about it on the right */}
                <div className="card-body">
                  <div className="ship-panel">
                    <ShipSchematic design={design} highlight={ev.affectsPart} pointing={pointedAt} damage={damageFor(ev.id)} />
                    <span className="part-name">{partName(design, ev.affectsPart)}</span>
                  </div>
                  <div className="card-words">
                    {ev.causedOnDay !== undefined && (
                      <p className="because">{`This is because of your choice on day ${ev.causedOnDay}.`}</p>
                    )}
                    {caller && (
                      <p className="caller" title={say(TEAM_TEXT.yourCallHint, { name: caller.player.name })}>
                        {`${caller.role.icon} ${say(TEAM_TEXT.yourCall, { name: caller.player.name, role: caller.role.name })}`}
                      </p>
                    )}
                    <p className="explain">{ev.explain}</p>
                    {context && (context.whatIsIt || context.realExample) && (
                      <div className="why">
                        <button type="button" className="link" aria-expanded={contextOpen} onClick={onToggleContext}>
                          <span aria-hidden="true">{contextOpen ? "▾" : "▸"}</span> Why does this happen?
                        </button>
                        {contextOpen && (
                          <div className="context">
                            {context.whatIsIt && <p><b>What is this?</b> {context.whatIsIt}</p>}
                            {context.realExample && <p><b>Real story:</b> {context.realExample}</p>}
                          </div>
                        )}
                      </div>
                    )}
                    <div className="options">
                      {ev.options.map((o, i) => (
                        <button key={o.id} ref={i === 0 ? firstOption : undefined} className="option" onClick={() => onDecide(o.id)}
                          onMouseEnter={() => setPointed(o.id)} onMouseLeave={() => setPointed(null)}
                          onFocus={() => setPointed(o.id)} onBlur={() => setPointed(null)}>
                          {o.label}
                          <span className="affects">
                            {chipsFor(o.effect, o.shielded).map((l) => <span key={l} className={"affect " + affectTone(l)}>{l}</span>)}
                          </span>
                          {o.warning && <small className="warn">{o.warning}</small>}
                        </button>
                      ))}
                    </div>
                    <p className="muted small">If the clock runs out, mission control picks the safest option for you.</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className={"gauges" + (hiding.hud ? " dim" : "")}>
          <Gauge label="Fuel" icon={short(GAUGE_ICON.fuel, undefined)} value={`${Math.round(sim.fuelKg).toLocaleString()} kg${short("", " left")}`}
            pct={c.fuelStartKg > 0 ? sim.fuelKg / c.fuelStartKg : 0}
            delta={deltaFor("fuel")} deltaKey={deltaKey} marks={short(undefined, marksFor("fuel"))} />
          <Gauge label="Power" icon={short(GAUGE_ICON.power, undefined)}
            value={short(`${Math.round(sim.powerW)} W`, `${Math.round(sim.powerW)} W made · ${sim.powerNeededW} W needed`)}
            pct={sim.powerW / Math.max(powerAtLaunch, sim.powerNeededW, 1)} bad={sim.powerW < sim.powerNeededW}
            dimmed={fx.arrival === "dust"} delta={deltaFor("power")} deltaKey={deltaKey} marks={short(undefined, marksFor("power"))} />
          <Gauge label={short("Signal", "Signal strength")} icon={short(GAUGE_ICON.signal, undefined)}
            value={signalLost ? short("none", "— no signal —") : `${Math.round(sim.signalStrength * 100)}%`} pct={sim.signalStrength}
            pulse={signalLost} delta={deltaFor("signal")} deltaKey={deltaKey} marks={short(undefined, marksFor("signal"))} />
          <Gauge label={short("Delay", "Signal delay")} icon={short(GAUGE_ICON.delay, undefined)}
            value={short(formatSignalDelay(sim.signalDelayMinutes), `Earth hears you after ${formatSignalDelay(sim.signalDelayMinutes)}`)} pct={null} />
          <Gauge label={short("Distance", "Distance from Earth")} icon={short(GAUGE_ICON.distance, undefined)}
            value={distance} pct={sim.distanceFromEarthAU / maxDistanceAU}
            sub={short(undefined, `${sim.distanceFromEarthAU.toFixed(sim.distanceFromEarthAU < 0.1 ? 4 : 2)} AU`)} />
          <Gauge label={short("Science", "Science collected")} icon={short(GAUGE_ICON.science, undefined)}
            value={short(`${sim.scienceCollected} pts`, scienceValue(sim.scienceCollected, c.scienceTotal))}
            pct={c.scienceTotal > 0 ? sim.scienceCollected / c.scienceTotal : 0}
            instruments={short(undefined, instrumentStates(instruments, sim, fx))}
            delta={deltaFor("science")} deltaKey={deltaKey} marks={short(undefined, marksFor("science"))} />
          {spaceView && (
            <div className="hud-extra">
              <label className="plan-toggle">
                <input type="checkbox" checked={showPlan} onChange={onTogglePlan} />
                Show flight plan
              </label>
              {showPlan && <span className="plan-note">Planned path — this is where the plan says you will be.</span>}
              <ProvenanceNote className="space-note" text="Orbits and distances to scale. The stars are decoration." />
            </div>
          )}
        </div>

        <section className={"log" + (hiding.topRight ? " dim" : "")} onKeyDown={(e) => { if (e.key === "Escape" && openInfo !== null) { e.stopPropagation(); closeInfo(openInfo); } }}>
          <h4>Mission log</h4>
          <ul tabIndex={0} aria-label="Mission log, newest first">
            {sim.log.map((l, i) => {
              const event = logEvent(l.text);
              const good = /protected you|took over|found Earth again|does not need sunlight/i.test(l.text);
              const info = openInfo === i && event ? eventContext(event.id) : null;
              return (
                <li key={i} className={good ? "good" : ""}>
                  <b>{`Day ${l.day}`}</b>{l.text}
                  {event && (
                    <button type="button" className="info" ref={(el) => { infoButtons.current[i] = el; }}
                      aria-expanded={openInfo === i} aria-controls={openInfo === i ? "log-popover" : undefined}
                      aria-label={`More about: ${event.name}`}
                      onClick={() => (openInfo === i ? closeInfo(i) : onOpenInfo(i))}>ℹ</button>
                  )}
                  {info && (
                    <div className="popover" id="log-popover" role="note" ref={popover} tabIndex={-1} aria-label={`About ${event!.name.toLowerCase()}`}>
                      <button type="button" className="close" aria-label="Close" onClick={() => closeInfo(i)}>✕</button>
                      <p><b>What is this?</b> {info.whatIsIt}</p>
                      <p><b>Real story:</b> {info.realExample}</p>
                      <p className="muted small">{info.howCommon}</p>
                    </div>
                  )}
                </li>
              );
            }).reverse()}
          </ul>
        </section>
      </div>
    </div>
  );
}

/** The widest orbit in map units: always fitted to the shorter side, so nothing is ever cropped. */
export const orbitScale = (viewW: number, viewH: number, share: number = R_MAX_SHARE) => Math.min(viewW, viewH) * share;

/**
 * A map label with a dark pill behind it, so no label ever sits unreadable on top of a star.
 * SVG has no text background, so the pill is a rounded rect sized from the text itself.
 */
function MapLabel({ x, y, children, scale = 1 }: { x: number; y: number; children: string; scale?: number }) {
  return (
    <g className="map-label">
      <rect className="label-pill" x={x - 5 * scale} y={y - 11 * scale} width={(children.length * 6.4 + 10) * scale}
        height={15 * scale} rx={7 * scale} />
      <text className="label" x={x} y={y} style={{ fontSize: 12 * scale }}>{children}</text>
    </g>
  );
}

/**
 * The map geometry in SVG units: where everything is, for the map and its effects layer.
 * `coastDays` is the time that has passed since the mission ended: the planets go on along their
 * orbits, and a spacecraft that made it into orbit is carried round the Sun with the one it reached.
 */
export function mapGeometry(
  sim: SimState, path: { radiusAU: number; angleRad: number }[], viewW: number = VIEW_W, viewH: number = VIEW_H,
  rMaxShare: number = R_MAX_SHARE, coastDays: number = 0,
): MapGeometry {
  const c = sim.config;
  const earthCentred = c.centralBody === "earth";
  const k = orbitScale(viewW, viewH, rMaxShare) / Math.max(c.targetOrbitRadiusAU, earthCentred ? 0 : EARTH_ORBIT_AU);
  const mid = { x: viewW / 2, y: viewH / 2 };
  const xy = (r: number, a: number) => ({ x: mid.x + r * k * Math.cos(a), y: mid.y - r * k * Math.sin(a) });
  const sky = coastDays > 0 ? coastAngles(sim, coastDays) : sim;
  const ship = xy(sim.spacecraft.radiusAU, sim.spacecraft.angleRad);
  const target = xy(c.targetOrbitRadiusAU, sky.targetAngleRad);
  const earth = earthCentred ? { ...mid } : xy(EARTH_ORBIT_AU, sky.earthAngleRad);
  const pathPx = path.map((p) => xy(p.radiusAU, p.angleRad));
  // In orbit the spacecraft is carried along by the planet, so the path it has ridden since arrival is
  // the planet's own orbit. Without this the trail would stop where the planet used to be and the
  // spacecraft would look as though it had jumped away from its own path.
  const coastPath = coastDays > 0 && sim.phase === "orbit"
    ? arcPoints(mid, c.targetOrbitRadiusAU * k, sim.targetAngleRad, (2 * Math.PI * coastDays) / c.targetOrbitDays)
    : [];

  // heading: towards the next point on the path (or along the last bit of path at the end)
  const flown = Math.floor((sim.missionDay / sim.totalDays) * (path.length - 1));
  const next = pathPx[Math.min(pathPx.length - 1, flown + 1)];
  let dx = next.x - ship.x;
  let dy = next.y - ship.y;
  if (Math.abs(dx) + Math.abs(dy) < 1e-6 && flown > 0) {
    const back = pathPx[flown - 1];
    dx = ship.x - back.x;
    dy = ship.y - back.y;
  }
  const heading = (Math.atan2(dy, dx) * 180) / Math.PI;
  return { viewW, viewH, mid: mid.x, earthCentred, ship, earth, target, sun: earthCentred ? null : { ...mid }, heading, pathPx, coastPath };
}

/** Points along a circle, starting at angle `from` and going `span` radians the way the planets go. */
function arcPoints(mid: Pt, r: number, from: number, span: number): Pt[] {
  const swept = Math.min(2 * Math.PI, Math.max(0, span)); // one lap is as much as there is to draw
  const steps = Math.max(1, Math.ceil(swept / 0.04));
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = from + (swept * i) / steps;
    return { x: mid.x + r * Math.cos(a), y: mid.y - r * Math.sin(a) };
  });
}

/**
 * The map. Sun-centred trips: Sun in the middle, Earth and the target on dashed orbits.
 * Earth-centred trips (Moon): Earth in the middle, the Moon on its orbit.
 * The spacecraft, its trail end and every effect are drawn by MapEffects on top.
 */
function FlightMap({ sim, design, path, target, color, fx, viewH = VIEW_H, spaceView = false, showPlan = false, coastDays = 0, beat = null }: {
  sim: SimState; design: Design; path: { radiusAU: number; angleRad: number }[]; target: string; color: string; fx: Fx;
  viewH?: number; spaceView?: boolean; showPlan?: boolean; coastDays?: number; beat?: string | null;
}) {
  const c = sim.config;
  const share = spaceView ? R_MAX_SHARE_SPACE : R_MAX_SHARE;
  const g = mapGeometry(sim, path, VIEW_W, viewH, share, coastDays);
  const k = orbitScale(VIEW_W, viewH, share) / Math.max(c.targetOrbitRadiusAU, g.earthCentred ? 0 : EARTH_ORBIT_AU);
  // the map is drawn about twice as large in space view, so text in map units is halved to look the same
  const textScale = spaceView ? 0.55 : 1;
  const cx = VIEW_W / 2;
  const cy = viewH / 2;
  const flown = Math.floor((sim.missionDay / sim.totalDays) * (path.length - 1));
  // the path flown, and then the stretch of the planet's orbit ridden since arrival
  const trail = [...g.pathPx.slice(0, flown + 1), g.ship, ...g.coastPath];
  const points = trail.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  // A short lead ahead of the spacecraft, fading out: enough to read which way it is heading, and not
  // so much that it looks like a rail promising an arrival the engine may not manage.
  const leadEnd = Math.min(g.pathPx.length - 1, flown + Math.round(path.length * LEAD_SHARE));
  const lead = [g.ship, ...g.pathPx.slice(flown + 1, leadEnd + 1)];
  const leadPoints = lead.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const leadTip = lead[lead.length - 1] ?? g.ship;
  // the whole plan, only when the player asks for it
  const ahead = [g.ship, ...g.pathPx.slice(flown + 1)].map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  // a scale bar measured from this map's own AU-to-pixel factor, so it is honest at every zoom
  const bar = scaleBar(k, VIEW_W * 0.14);
  const barY = viewH - (spaceView ? 46 : 18);
  // whole days spent in orbit since the mission ended, once there is at least one to report
  const orbitDays = sim.phase === "orbit" && coastDays >= 1 ? Math.floor(coastDays) : null;

  return (
    <svg viewBox={`0 0 ${VIEW_W} ${viewH}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`Map of the flight to ${target}`}>
      <Starfield viewW={VIEW_W} viewH={viewH} />
      <defs>
        {/* the corona fades outwards, so the Sun glows instead of sitting inside a disc */}
        <radialGradient id="sun-glow">
          <stop offset="0%" stopColor="#ffd75e" stopOpacity="0.55" />
          <stop offset="45%" stopColor="#ffc24a" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#ff9a3c" stopOpacity="0" />
        </radialGradient>
      </defs>
      {!g.earthCentred && <circle className="orbit" cx={cx} cy={cy} r={EARTH_ORBIT_AU * k} />}
      <circle className="orbit" cx={cx} cy={cy} r={c.targetOrbitRadiusAU * k} />

      {/* the Sun: a warm core inside a soft corona, the brightest thing on the screen */}
      {!g.earthCentred && <circle className="sun-corona" cx={cx} cy={cy} r={34} fill="url(#sun-glow)" />}
      <circle className={g.earthCentred ? "planet earth" : "sun-core"} cx={cx} cy={cy} r={g.earthCentred ? 12 : 14}
        fill={g.earthCentred ? "#4f8cff" : "#ffd75e"} />
      <MapLabel x={cx + 20 * textScale} y={cy + 4} scale={textScale}>{g.earthCentred ? "Earth" : "Sun"}</MapLabel>

      {showPlan && <polyline className="path-ahead" points={ahead} />}
      {lead.length > 1 && (
        <>
          <defs>
            <linearGradient id="lead-fade" gradientUnits="userSpaceOnUse"
              x1={g.ship.x} y1={g.ship.y} x2={leadTip.x} y2={leadTip.y}>
              <stop offset="0%" stopColor="#8fc2ff" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#8fc2ff" stopOpacity="0" />
            </linearGradient>
          </defs>
          <polyline className="path-lead" points={leadPoints} stroke="url(#lead-fade)" />
        </>
      )}
      <polyline className="trail" points={points} />

      {!g.earthCentred && (
        <>
          <circle className="planet earth" cx={g.earth.x} cy={g.earth.y} r={6} fill="#4f8cff" />
          <MapLabel x={g.earth.x + 11 * textScale} y={g.earth.y + 4} scale={textScale}>Earth</MapLabel>
        </>
      )}
      <circle className="planet target" cx={g.target.x} cy={g.target.y} r={7} fill={color} />
      <MapLabel x={g.target.x + 12 * textScale} y={g.target.y + 4} scale={textScale}>{target}</MapLabel>

      <MapEffects sim={sim} design={design} g={g} fx={fx} showMarkers={!spaceView} />

      {/* two seconds of it happening, before the card says what it was */}
      {beat && <Beat kind={beatFor(beat)} g={g} />}

      {/* the mission is over and the clock is still running, which is why the planets are still moving.
          It sits by the scale bar, out of the way of the top strip, where the status line needs the room. */}
      {orbitDays !== null && (
        <g data-effect="in-orbit">
          <MapLabel x={23} y={barY - 26} scale={textScale}>{`In orbit for ${orbitDays} ${orbitDays === 1 ? "day" : "days"}`}</MapLabel>
        </g>
      )}

      {/* how far is that? the same question the whole game is about */}
      <g className="scale-bar" transform={`translate(18 ${barY})`}>
        <line x1="0" y1="0" x2={bar.lengthPx} y2="0" />
        <line x1="0" y1="-4" x2="0" y2="4" />
        <line x1={bar.lengthPx} y1="-4" x2={bar.lengthPx} y2="4" />
        <text x="0" y={-8} style={{ fontSize: 12 * textScale }}>{bar.label}</text>
      </g>
    </svg>
  );
}
