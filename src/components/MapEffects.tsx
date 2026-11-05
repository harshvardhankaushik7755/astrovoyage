import type { CSSProperties } from "react";
import type { Decision, SimState } from "../sim/simulation";
import { eventIcon } from "../sim/deltas";
import { ShipSprite } from "./Spacecraft";
import { spriteHaloRadius, spriteTailX } from "../sim/shipLayout";
import type { Design } from "../physics/checks";

/**
 * The effects layer of the flight map (Stage 7): the spacecraft sprite and everything that shows
 * cause and effect. Three moments: (A) a challenge arrives (pendingEvent), (B) the player decides
 * (`fx.flash`, about two seconds), (C) what stays for the rest of the trip (read from the sim state).
 * Pure SVG from the sim state and the geometry the map computed; CSS in styles.css does the motion.
 * Every effect carries a data-effect attribute so tests can check which one is on screen.
 */
export interface Pt { x: number; y: number }
export interface MapGeometry {
  viewW: number;
  viewH: number;
  mid: number;
  earthCentred: boolean;
  ship: Pt;
  earth: Pt;
  target: Pt;
  sun: Pt | null;      // null on an Earth-centred map (the Sun is off to the left)
  heading: number;     // degrees, screen space, direction of travel
  pathPx: Pt[];        // the whole transfer path in map units
  coastPath: Pt[];     // the planet's orbit ridden since arrival, empty until the mission is over
}
export interface Flash { decision: Decision; index: number }
export interface Fx {
  arrival: string | null;    // id of the challenge waiting for a decision
  flash: Flash | null;       // the decision just made
  countdown: number | null;  // 3, 2, 1 before the braking burn
  burning: boolean;          // the braking burn itself
}

const PARTICLES = 12;
const HAZE = 8;
const PUFFS = 6;
const SPARKS = 8;

/** CSS variables that tell a keyframe where a particle should fly to. */
const flyTo = (dx: number, dy: number) => ({ "--dx": `${dx.toFixed(1)}px`, "--dy": `${dy.toFixed(1)}px` }) as CSSProperties;

/** The point on the trail for a mission day. */
function trailPoint(g: MapGeometry, sim: SimState, day: number): Pt {
  const last = g.pathPx.length - 1;
  const i = Math.max(0, Math.min(last, Math.round((day / sim.totalDays) * last)));
  return g.pathPx[i];
}

/** Which decision effect to show: the name doubles as the data-effect for tests. */
export function decisionEffect(d: Decision, sim: SimState): string {
  const failedText = sim.phase === "failed" && sim.log.length ? sim.log[sim.log.length - 1].text : "";
  switch (d.eventId) {
    case "solarStorm":
      if (d.optionId === "safe") return "storm-safe";
      if (/storm/i.test(failedText)) return "storm-sparks";
      return /protected/i.test(d.outcome) ? "storm-shield" : "storm-flicker";
    case "dust":
      return d.optionId === "shake" ? "dust-shake" : d.optionId === "nothing" ? "dust-settled" : "dust-auto";
    case "courseDrift":
      return d.optionId === "correct" ? "drift-correct" : "drift-ignore";
    case "lostSignal":
      return d.optionId === "switch" ? "signal-reconnect" : d.optionId === "wait" ? "signal-wait" : "signal-dim";
    case "instrumentFault":
      return d.optionId === "auto" ? "fault-backup" : d.optionId === "reboot" ? "fault-reboot" : "fault-accept";
    default:
      return "auto";
  }
}

/**
 * The decisions that happened on each day, with their icons. Grouping by day is what stops two
 * decisions taken on the same day from painting one marker on top of another.
 */
export function markersByDay(decisions: Decision[]): { day: number; icons: string }[] {
  const byDay = new Map<number, string[]>();
  for (const d of decisions) {
    const day = Math.round(d.day);
    byDay.set(day, [...(byDay.get(day) ?? []), eventIcon(d.eventId)]);
  }
  return [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([day, icons]) => ({ day, icons: icons.join("") }));
}

export function MapEffects({ sim, design, g, fx, showMarkers = true }: { sim: SimState; design: Design; g: MapGeometry; fx: Fx; showMarkers?: boolean }) {
  const rad = (g.heading * Math.PI) / 180;
  const tail = Math.round(spriteTailX(design));
  const halo = Number(spriteHaloRadius(design).toFixed(1));
  const dir = { x: Math.cos(rad), y: Math.sin(rad) };
  const flash = fx.flash?.decision ?? null;
  const effect = flash ? decisionEffect(flash, sim) : "";
  const failedText = sim.phase === "failed" && sim.log.length ? sim.log[sim.log.length - 1].text : "";
  const stormDeath = /storm/i.test(failedText);
  const flewPast = sim.phase === "failed" && /flew past|off course/i.test(failedText);
  const orbiting = sim.phase === "orbit";

  // (A) course drift: the sprite slides a few pixels off its line while the card is open
  const drift = fx.arrival === "courseDrift" ? { x: -dir.y * 6, y: dir.x * 6 } : { x: 0, y: 0 };
  const ship = { x: g.ship.x + drift.x, y: g.ship.y + drift.y };
  const stormSource = g.sun ?? { x: -16, y: ship.y };

  // sprite state
  const spriteClass = ["sprite"];
  if (stormDeath) spriteClass.push("dark");
  if (effect === "storm-flicker") spriteClass.push("flicker");
  if (effect === "storm-safe") spriteClass.push("offline");
  if (effect === "dust-shake") spriteClass.push("wiggle");
  if (fx.arrival === "courseDrift") spriteClass.push("drifted"); // the slide itself is a CSS transition on the sprite
  if (flewPast) spriteClass.push("flypast");
  const showFlame = fx.burning || effect === "drift-correct";

  // (C) lasting marks derived from the state
  const driftIgnored = sim.phase === "cruise" && sim.insertionRisk > 0;
  const signalDim = sim.decisions.some((d) => d.eventId === "lostSignal" && d.optionId === "guess");
  const missEnd = { x: ship.x + dir.x * 170, y: ship.y + dir.y * 170 };

  return (
    <g className="fx">
      {/* ---- (A) arrival ---- */}
      {fx.arrival === "solarStorm" && (
        <g data-effect="storm-arrival">
          <rect className="fx-tint" x={0} y={0} width={g.viewW} height={g.viewH} />
          {Array.from({ length: PARTICLES }, (_, i) => {
            const a = (i / PARTICLES) * Math.PI * 2;
            const end = { x: ship.x + Math.cos(a) * 18, y: ship.y + Math.sin(a) * 18 };
            return <circle key={i} className="fx-particle" cx={stormSource.x} cy={stormSource.y} r={2} style={flyTo(end.x - stormSource.x, end.y - stormSource.y)} />;
          })}
        </g>
      )}
      {fx.arrival === "dust" && (
        <g data-effect="dust-arrival">
          {Array.from({ length: HAZE }, (_, i) => {
            const a = (i / HAZE) * Math.PI * 2;
            return <circle key={i} className="fx-haze" cx={ship.x + Math.cos(a) * 9} cy={ship.y + Math.sin(a) * 9} r={5 + (i % 3) * 2} />;
          })}
        </g>
      )}
      {(fx.arrival === "courseDrift" || driftIgnored) && (
        <g data-effect={fx.arrival === "courseDrift" ? "drift-arrival" : "drift-ignored"} className={driftIgnored && !fx.arrival ? "lasting" : ""}>
          <line className="fx-miss" x1={ship.x} y1={ship.y} x2={missEnd.x} y2={missEnd.y} />
          <circle className="fx-target-warn" cx={g.target.x} cy={g.target.y} r={12} />
        </g>
      )}
      {fx.arrival === "lostSignal" && (
        <line data-effect="signal-lost" className="fx-signal broken" x1={g.earth.x} y1={g.earth.y} x2={ship.x} y2={ship.y} />
      )}
      {fx.arrival === "instrumentFault" && (
        <text data-effect="fault-arrival" className="fx-badge" x={ship.x + 9} y={ship.y - 9}>!</text>
      )}
      {signalDim && fx.arrival !== "lostSignal" && (
        <line data-effect="signal-dim" className="fx-signal dim" x1={g.earth.x} y1={g.earth.y} x2={ship.x} y2={ship.y} />
      )}

      {/* ---- (C) where each challenge happened, on the trail ----
           One marker per DAY, not per decision: two decisions on the same day sit at the same point on
           the trail, and drawing both painted the same text twice, which read as doubled digits. */}
      {showMarkers && markersByDay(sim.decisions).map((m) => {
        const p = trailPoint(g, sim, m.day);
        const text = `${m.icons} Day ${m.day}`;
        return (
          <g key={m.day} className="fx-marker" data-effect="marker">
            <circle cx={p.x} cy={p.y} r={6} />
            {/* a dark pill, so the label is never lost against a star */}
            <rect className="marker-pill" x={p.x + 4} y={p.y - 17} width={text.length * 5.6 + 8} height={13} rx={6} />
            <text x={p.x + 8} y={p.y - 7}>{text}</text>
          </g>
        );
      })}

      {/* ---- the spacecraft ---- */}
      {fx.burning && <circle className="glow" cx={ship.x} cy={ship.y} r={14} />}
      {orbiting ? (
        // in orbit: the group is drawn at the planet, so the spacecraft goes round it wherever the
        // planet has got to on its own orbit. The path it rides is drawn much wider and much slower
        // than a real one, or it would be a dot moving too fast to see.
        <g data-effect="orbit-captured" transform={`translate(${g.target.x.toFixed(1)} ${g.target.y.toFixed(1)})`}>
          <circle className="fx-orbit-ring" r={8} />
          <circle className="parking-orbit" r={16} />
          <g className="orbiting">
            <g transform="translate(16 0) rotate(90)"><ShipSprite design={design} /></g>
          </g>
        </g>
      ) : (
        <g transform={`translate(${g.ship.x.toFixed(1)} ${g.ship.y.toFixed(1)}) rotate(${g.heading.toFixed(1)})`}>
          <g className={spriteClass.join(" ") + (fx.burning ? " burning" : "")} data-effect={flewPast ? "fly-past" : undefined}>
            {/* the flame starts at the back of this spacecraft, which is further back on a bigger one */}
            {showFlame && <polygon className="flame" data-effect={fx.burning ? "burn" : "drift-correct"}
              points={`${tail},0 ${tail - 12},4 ${tail - 12},-4`} />}
            {/* a small bright halo, so the spacecraft never disappears against a star */}
            <circle className="ship-halo" r={halo} />
            <ShipSprite design={design} />
          </g>
        </g>
      )}

      {/* ---- (B) the moment of the decision ---- */}
      {flash && (
        <g className="fx-decision" data-effect={effect}>
          {effect === "storm-shield" && <circle className="fx-shield" cx={ship.x} cy={ship.y} r={10} />}
          {effect === "storm-sparks" && Array.from({ length: SPARKS }, (_, i) => {
            const a = (i / SPARKS) * Math.PI * 2;
            return <circle key={i} className="fx-spark" cx={ship.x} cy={ship.y} r={2} style={flyTo(Math.cos(a) * 22, Math.sin(a) * 22)} />;
          })}
          {effect === "dust-shake" && Array.from({ length: PUFFS }, (_, i) => {
            const a = (i / PUFFS) * Math.PI * 2 + 0.4;
            return <circle key={i} className="fx-puff" cx={ship.x} cy={ship.y} r={3} style={flyTo(Math.cos(a) * 20, Math.sin(a) * 20)} />;
          })}
          {(effect === "signal-reconnect" || effect === "signal-wait") && (
            <>
              <line className="fx-signal" x1={g.earth.x} y1={g.earth.y} x2={ship.x} y2={ship.y} />
              <circle className="fx-pulse" cx={g.earth.x} cy={g.earth.y} r={3} style={flyTo(ship.x - g.earth.x, ship.y - g.earth.y)} />
            </>
          )}
          {(effect === "fault-backup" || effect === "dust-auto") && <circle className="fx-shield ok" cx={ship.x} cy={ship.y} r={10} />}
        </g>
      )}

      {/* ---- orbit insertion ---- */}
      {fx.countdown !== null && (
        <text key={fx.countdown} data-effect="countdown" className="fx-count" x={g.viewW / 2} y={g.viewH / 2 + 18}>{fx.countdown}</text>
      )}
    </g>
  );
}
