import type { Bar } from "../physics/checks";

/**
 * Four live bars at the top of the Design Lab. Red, with a warning mark, when a rule is broken.
 * Under each bar its two numbers are said in words ("uses 50 W · makes 260 W there"), so the bar explains itself.
 */
export function ResourceBars({ bars }: { bars: Bar[] }) {
  return (
    <div className="bars">
      {bars.map((b) => {
        const pct = b.limit > 0 ? Math.min(100, (b.value / b.limit) * 100) : 100;
        return (
          <div key={b.label} className={"bar " + (b.ok ? "ok" : "bad")} role="group"
            aria-label={`${b.label}: ${b.value} of ${b.limit}, ${b.ok ? "OK" : "over the limit"}`}>
            <div className="bar-head">
              <span>{`${b.ok ? "✓" : "⚠"} ${b.label}`}</span>
              {!b.hint && <span>{`${b.value} / ${b.limit}`}</span>}
              {b.hint && <span className="bar-state">{b.ok ? "OK" : "Fix this"}</span>}
            </div>
            <div className="bar-track"><div className="bar-fill" style={{ width: pct + "%" }} /></div>
            {b.hint && <div className="bar-hint">{b.hint}</div>}
          </div>
        );
      })}
    </div>
  );
}
