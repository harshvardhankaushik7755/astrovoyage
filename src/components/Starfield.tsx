import { memo, useMemo } from "react";
import sky from "../data/sky.json";
import { buildSky } from "../sim/sky";

/**
 * The sky behind the flight map (Stage 11 Part 1). It is drawn inside the map's own <svg>, so the space
 * view is a true zoom of the same picture rather than a second drawing.
 *
 * The stars DO NOT MOVE as the spacecraft travels, and that is not laziness: it is correct. The stars are
 * so far away that crossing the whole solar system does not shift them by anything you could see. Only
 * the Sun, the planets and the spacecraft move on this map. The glossary says the same thing under
 * "Why don't the stars move?".
 *
 * The whole layer is built once for a given map size and memoised, so the mission clock ticking sixty
 * times a second never touches a single star.
 */
function StarfieldLayer({ viewW, viewH }: { viewW: number; viewH: number }) {
  skyRenders.count++;
  const s = useMemo(() => buildSky(viewW, viewH), [viewW, viewH]);
  const cx = viewW / 2;
  const cy = viewH / 2;
  const twinkling = sky.twinkle.on ? sky.twinkle.stars : 0;

  return (
    <g className="sky" aria-hidden="true">
      <defs>
        <radialGradient id="sky-wash-blue" cx="28%" cy="24%" r="72%">
          <stop offset="0%" stopColor="#2a4a8f" stopOpacity="0.30" />
          <stop offset="100%" stopColor="#2a4a8f" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="sky-wash-violet" cx="76%" cy="78%" r="66%">
          <stop offset="0%" stopColor="#5b3a8f" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#5b3a8f" stopOpacity="0" />
        </radialGradient>
        {/* the band is feathered at both edges, so it reads as a band of light and not a painted stripe */}
        <linearGradient id="sky-band" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={sky.milkyWay.edgeColor} stopOpacity="0" />
          <stop offset="30%" stopColor={sky.milkyWay.edgeColor} stopOpacity={sky.milkyWay.peakAlpha * 0.45} />
          <stop offset="50%" stopColor={sky.milkyWay.color} stopOpacity={sky.milkyWay.peakAlpha} />
          <stop offset="70%" stopColor={sky.milkyWay.edgeColor} stopOpacity={sky.milkyWay.peakAlpha * 0.45} />
          <stop offset="100%" stopColor={sky.milkyWay.edgeColor} stopOpacity="0" />
        </linearGradient>
        <radialGradient id="sky-nebula">
          <stop offset="0%" stopColor="#b98cff" stopOpacity="0.9" />
          <stop offset="60%" stopColor="#7b5bd6" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#7b5bd6" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="sky-galaxy">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="45%" stopColor="#cfd8ff" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#cfd8ff" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* 1. the black is never flat */}
      <rect className="sky-wash" x="0" y="0" width={viewW} height={viewH} fill="url(#sky-wash-blue)" />
      <rect className="sky-wash" x="0" y="0" width={viewW} height={viewH} fill="url(#sky-wash-violet)" />

      {/* 2. the Milky Way */}
      <g transform={`rotate(${s.band.angleDeg} ${cx} ${cy})`}>
        <rect className="sky-band" x={-viewW} y={cy - s.band.width / 2} width={viewW * 3} height={s.band.width}
          fill="url(#sky-band)" opacity={s.band.opacity} />
      </g>

      {/* 3. a galaxy or two and a nebula, right out at the edges */}
      {s.nebulae.map((n, i) => (
        <circle key={`n${i}`} className="sky-nebula" cx={n.x} cy={n.y} r={n.r} fill="url(#sky-nebula)" opacity={n.o} />
      ))}
      {s.galaxies.map((g, i) => (
        <g key={`g${i}`} transform={`rotate(${g.angle} ${g.x} ${g.y})`}>
          <ellipse className="sky-galaxy" cx={g.x} cy={g.y} rx={g.rx} ry={g.ry} fill="url(#sky-galaxy)" opacity={g.o} />
          <circle className="sky-galaxy-core" cx={g.x} cy={g.y} r={g.ry * 0.4} fill="#ffffff" opacity={g.o * 1.4} />
        </g>
      ))}

      {/* 4. the stars themselves, densest along the band */}
      {s.stars.map((star, i) => (
        <circle key={i} className={"sky-star" + (star.tint ? " " + star.tint : "") + (i < twinkling ? " twinkle" : "")}
          cx={star.x} cy={star.y} r={star.r} opacity={star.o} />
      ))}
    </g>
  );
}

/**
 * How many times the sky has been drawn. The only reader is the test that proves the mission clock
 * does not redraw it; nothing in the game looks at this.
 */
export const skyRenders = { count: 0 };

/** Memoised on the map size alone: the mission moving never redraws the sky. */
export const Starfield = memo(StarfieldLayer);
