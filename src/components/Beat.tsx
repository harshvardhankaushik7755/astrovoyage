/**
 * The two-second beat before a challenge card (Stage 12 Part 3).
 *
 * Something happens to the spacecraft, and for two seconds you watch it happen on the map instead of
 * reading about it on a card. Pure SVG over the flight map, animated by CSS in styles.css, drawn from
 * the geometry the map already worked out. It blocks nothing: a click or Escape skips it, and the
 * engine has already stopped the mission clock, so the beat costs the player no mission time at all.
 */
import type { Beat as BeatKind } from "../sim/context";
import type { MapGeometry } from "./MapEffects";

const GRAINS = 7;
const RAYS = 5;

/** A beat playing over the map. `kind` comes from beatFor(eventId). */
export function Beat({ kind, g }: { kind: BeatKind; g: MapGeometry }) {
  const ship = g.ship;
  const sun = g.sun ?? { x: -20, y: ship.y };
  // where the trouble comes from: the Sun for light and flares, off-screen for everything else
  const from = { x: sun.x, y: sun.y };
  return (
    <g className={`beat beat-${kind}`} data-beat={kind} aria-hidden="true">
      {kind === "dust" && Array.from({ length: GRAINS }, (_, i) => (
        <circle key={i} className="beat-grain" cx={ship.x - 26 + i * 2} cy={ship.y - 10 + (i % 3) * 8} r={1.6 + (i % 3) * 0.6}
          style={{ animationDelay: `${i * 0.11}s` }} />
      ))}
      {kind === "rock" && (
        <g className="beat-rock">
          <polygon points="0,-4 4,-1 3,4 -3,3 -4,-2" transform={`translate(${ship.x - 40} ${ship.y - 26})`} />
        </g>
      )}
      {kind === "dish" && (
        <>
          <line className="beat-link" x1={g.earth.x} y1={g.earth.y} x2={ship.x} y2={ship.y} />
          <circle className="beat-swing" cx={ship.x} cy={ship.y} r={11} />
        </>
      )}
      {kind === "flare" && (
        <>
          <circle className="beat-flare" cx={from.x} cy={from.y} r={18} />
          {Array.from({ length: GRAINS }, (_, i) => {
            const a = (i / GRAINS) * Math.PI * 2;
            return <circle key={i} className="beat-particle" cx={from.x} cy={from.y} r={2}
              style={{ "--dx": `${(ship.x - from.x + Math.cos(a) * 14).toFixed(1)}px`, "--dy": `${(ship.y - from.y + Math.sin(a) * 14).toFixed(1)}px`, animationDelay: `${i * 0.06}s` } as React.CSSProperties} />;
          })}
        </>
      )}
      {kind === "blink" && (
        <>
          <circle className="beat-blink" cx={ship.x} cy={ship.y} r={10} />
          <text className="beat-mark" x={ship.x + 11} y={ship.y - 9}>!</text>
        </>
      )}
      {kind === "light" && Array.from({ length: RAYS }, (_, i) => (
        <line key={i} className="beat-ray" x1={from.x} y1={from.y + (i - 2) * 6} x2={ship.x} y2={ship.y + (i - 2) * 4}
          style={{ animationDelay: `${i * 0.08}s` }} />
      ))}
      {kind === "chance" && (
        <>
          <circle className="beat-spark" cx={ship.x} cy={ship.y} r={9} />
          <text className="beat-star" x={ship.x} y={ship.y - 14}>★</text>
        </>
      )}
      {kind === "alert" && <circle className="beat-ring" cx={ship.x} cy={ship.y} r={10} />}
    </g>
  );
}
