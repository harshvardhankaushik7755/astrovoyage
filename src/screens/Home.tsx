import { useMemo } from "react";
import scenarios from "../data/scenarios.json";
import { useGame } from "../store/gameStore";
import { isDemo } from "../sim/demo";
import { TEAM_TEXT } from "../sim/team";
import { MuteButton } from "../components/MuteButton";

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Home: what the game is, how to play in three steps, and the ways in (tutorial, free choice, team, a mission chip). */
export function Home() {
  const go = useGame((s) => s.go);
  const pick = useGame((s) => s.pickScenario);
  const startDemo = useGame((s) => s.startDemo);
  const playSolo = useGame((s) => s.playSolo);
  // the solo buttons break up a team from an earlier game; the team button keeps its names
  const solo = (then: () => void) => () => { playSolo(); then(); };
  const demo = isDemo();
  return (
    <div className="home">
      <SpaceBackdrop />
      <div className="home-top">
        <span className="pill">🛰️ NASA Space Apps Challenge 2026</span>
        <MuteButton />
      </div>

      <section className="hero">
        <div className="hero-text">
          <span className="eyebrow">Space Mission Design Game</span>
          <h1 className="title">Astro<span className="grad">Voyage</span></h1>
          <p className="lead">You are the mission engineer. Pick a goal, build a spacecraft, launch it, and keep it alive.</p>
          <div className="row cta">
            {demo ? (
              <>
                <button className="primary big" onClick={startDemo}>Start the demo mission (Mars) 🚀</button>
                <button className="big ghost" onClick={() => go("choose")}>Or build your own</button>
              </>
            ) : (
              <>
                <button className="primary big" onClick={solo(() => pick("moon"))}>Try the tutorial (Moon)</button>
                <button className="big ghost" onClick={solo(() => go("choose"))}>Start a mission</button>
                <button className="big ghost" onClick={() => go("team")}>{`👥 ${TEAM_TEXT.homeButton}`}</button>
              </>
            )}
          </div>
          {demo ? (
            <p className="muted small">Demo mode: a ready-made Mars spacecraft, already flying, with five
              cards in the first half-minute. Everything else works as usual.</p>
          ) : (
            <div className="mission-chips" role="group" aria-label="Jump straight to a mission">
              <span className="muted small">Or jump in:</span>
              {scenarios.map((sc) => (
                <button key={sc.id} className="chip" onClick={solo(() => pick(sc.id))} aria-label={`Design this mission: ${sc.name}`}>
                  <span className="dot" style={{ background: sc.color }} aria-hidden="true" />
                  {sc.target} <span className="muted">{`· ${sc.level.replace(" (tutorial)", "")}`}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <OrbitArt />
      </section>

      <ol className="howto" aria-label="How to play">
        <li><span className="step" aria-hidden="true">🎯</span><b>Pick a mission</b><span>Moon, Mars or Jupiter. Each one has a goal and a budget.</span></li>
        <li><span className="step" aria-hidden="true">🛠️</span><b>Build your spacecraft</b><span>Choose the parts and watch the four bars: money, mass, power and fuel.</span></li>
        <li><span className="step" aria-hidden="true">🚀</span><b>Launch and keep it alive</b><span>Pick a launch month, then handle the surprises on the way.</span></li>
      </ol>
      <p className="muted tagline">Every choice has a cost. More power means more mass. More mass means more fuel. More fuel means a bigger rocket.</p>
    </div>
  );
}

/** The night sky behind the home screen: soft nebula glows and a few hundred twinkling stars. */
function SpaceBackdrop() {
  const stars = useMemo(() => {
    let s = 42;
    const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    return Array.from({ length: 160 }, (_, i) => ({
      id: i, x: r() * 100, y: r() * 100, size: r() < 0.85 ? 1 + r() : 2 + r() * 1.5,
      delay: r() * 6, dur: 3 + r() * 5,
    }));
  }, []);
  return (
    <div className="space-bg" aria-hidden="true">
      <div className="nebula n1" />
      <div className="nebula n2" />
      <div className="nebula n3" />
      {stars.map((st) => (
        <span key={st.id} className="twinkle" style={{ left: `${st.x}%`, top: `${st.y}%`, width: st.size, height: st.size,
          animationDelay: `${st.delay}s`, animationDuration: `${st.dur}s` }} />
      ))}
      <span className="shooting" />
    </div>
  );
}

/**
 * A little solar system: three planets going round at their own speeds and a spacecraft flying a
 * transfer orbit from the inner orbit to the outer one, the same half-ellipse the game flies.
 */
function OrbitArt() {
  const still = reducedMotion();
  const C = 180;
  // a transfer ellipse that touches the inner orbit (r 70) on one side and the outer orbit (r 160) on the other
  const a = (70 + 160) / 2, cx = C - (160 - a);
  const transfer = `M ${C + 70} ${C} A ${a} ${a * 0.86} 0 1 1 ${C - 160} ${C} A ${a} ${a * 0.86} 0 1 1 ${C + 70} ${C}`;
  return (
    <svg className={"orbit-art" + (still ? " still" : "")} viewBox="0 0 360 360" aria-hidden="true">
      <defs>
        <radialGradient id="home-sun">
          <stop offset="0%" stopColor="#fff6cf" />
          <stop offset="35%" stopColor="#ffd75e" />
          <stop offset="100%" stopColor="#ff9a3c" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="home-earth" cx="35%" cy="35%">
          <stop offset="0%" stopColor="#9fd0ff" /><stop offset="60%" stopColor="#3f7de8" /><stop offset="100%" stopColor="#1b3a8a" />
        </radialGradient>
        <radialGradient id="home-mars" cx="35%" cy="35%">
          <stop offset="0%" stopColor="#ffb08a" /><stop offset="60%" stopColor="#d2603a" /><stop offset="100%" stopColor="#7a2c16" />
        </radialGradient>
        <radialGradient id="home-jupiter" cx="35%" cy="35%">
          <stop offset="0%" stopColor="#fff1d6" /><stop offset="60%" stopColor="#d8b98a" /><stop offset="100%" stopColor="#8a6a45" />
        </radialGradient>
      </defs>
      {[70, 115, 160].map((r) => <circle key={r} className="ring" cx={C} cy={C} r={r} />)}
      <ellipse className="transfer" cx={cx} cy={C} rx={a} ry={a * 0.86} />
      <circle cx={C} cy={C} r={46} fill="url(#home-sun)" className="sun-glow" />
      <circle cx={C} cy={C} r={17} fill="#ffe38a" />

      <g className="spin s1"><circle cx={C + 70} cy={C} r={8} fill="url(#home-earth)" />
        <g className="spin moon"><circle cx={C + 70 + 14} cy={C} r={2.4} fill="#d8d8d8" /></g></g>
      <g className="spin s2"><circle cx={C - 115} cy={C} r={6.5} fill="url(#home-mars)" /></g>
      <g className="spin s3">
        <circle cx={C + 160} cy={C} r={13} fill="url(#home-jupiter)" />
        <path d={`M ${C + 148} ${C - 3} h 24 M ${C + 147} ${C + 3} h 26`} stroke="#a37a4f" strokeWidth="1.6" opacity=".7" />
      </g>

      <g className="ship" transform={still ? `translate(${C + 70} ${C - 26})` : undefined}>
        <circle r="7" fill="#8fd1ff" opacity=".25" />
        <path d="M 6 0 L -4 -3.5 L -2 0 L -4 3.5 Z" fill="#ffffff" />
        <rect x="-3" y="-9" width="2.2" height="5.5" fill="#5b8cff" /><rect x="-3" y="3.5" width="2.2" height="5.5" fill="#5b8cff" />
        {!still && <animateMotion dur="9s" repeatCount="indefinite" rotate="auto" path={transfer} />}
      </g>
    </svg>
  );
}
