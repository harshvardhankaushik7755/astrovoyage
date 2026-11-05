import type { Delta, Mark } from "../sim/deltas";

export type InstrumentState = "ok" | "off" | "fault" | "backup" | "dead";
export interface GaugeInstrument { name: string; state: InstrumentState }

/**
 * One horizontal gauge for Mission Control, in the same style as the Design Lab bars.
 * pct is 0..1 (null = show the value only, no bar). bad = draw it red.
 * Cause and effect (Stage 7): a floating delta label the moment a decision changes the value, marks
 * that stay for the rest of the trip (hover or focus one for the full sentence), a dimmed state while
 * dust is on the panels, a grey pulse while the signal is lost, and instrument chips on the science gauge.
 * In the cockpit layout (Stage 8) the card is compact: one extras row holds the chips and the marks.
 */
export function Gauge({ label, value, pct, sub, bad, delta, deltaKey, marks, dimmed, pulse, instruments, icon }: {
  label: string; value: string; pct: number | null; sub?: string; bad?: boolean;
  /** One constant symbol for this gauge, shown in the space-view HUD. */
  icon?: string;
  delta?: Delta | null; deltaKey?: string | number; marks?: Mark[]; dimmed?: boolean; pulse?: boolean;
  instruments?: GaugeInstrument[];
}) {
  const width = pct === null ? 0 : Math.max(0, Math.min(100, pct * 100));
  const cls = ["bar", "gauge", bad ? "bad" : "ok", dimmed ? "dimmed" : "", pulse ? "pulse" : ""].filter(Boolean).join(" ");
  const hasExtras = (instruments && instruments.length > 0) || (marks && marks.length > 0);
  return (
    <div className={cls} role="group" aria-label={`${label}: ${value}`}>
      <div className="bar-head">
        <span>{icon && <span className="gauge-icon" aria-hidden="true">{icon} </span>}{(bad ? "⚠ " : "") + label}</span>
        <span>{value}</span>
      </div>
      {pct !== null && (
        <div className="bar-track">
          <div className="bar-fill" style={{ width: width + "%" }} />
        </div>
      )}
      {sub && <div className="sub">{sub}</div>}
      {hasExtras && (
        <div className="extras">
          {instruments?.map((i) => (
            // the state is spelled out for screen readers: aria-label is ignored on a plain span
            <span key={i.name} className={"instr " + i.state} title={describe(i)}>
              {i.state === "fault" && <b className="badge" aria-hidden="true">!</b>}
              {i.name}<span className="sr-only">{`: ${stateWord(i.state)}`}</span>
            </span>
          ))}
          {marks?.map((m, idx) => (
            <span key={idx} className="mark" role="note" tabIndex={0}>
              <span aria-hidden="true">{m.icon}</span> <span className="mark-text">{m.text}</span>
              <span className="sr-only">{`. ${m.sentence}`}</span>
              <span className="mark-tip" aria-hidden="true">{`${m.text}. ${m.sentence}`}</span>
            </span>
          ))}
        </div>
      )}
      {delta && <span key={deltaKey} className={"delta " + delta.tone} role="status">{delta.label}</span>}
    </div>
  );
}

function stateWord(state: InstrumentState): string {
  switch (state) {
    case "fault": return "fault";
    case "dead": return "switched off";
    case "off": return "off for safety";
    case "backup": return "backup took over";
    default: return "working";
  }
}

function describe(i: GaugeInstrument): string {
  return `${i.name}: ${stateWord(i.state)}`;
}
