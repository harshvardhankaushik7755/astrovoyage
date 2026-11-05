import { useCallback, useRef, useState } from "react";
import provenance from "../data/provenance.json";
import { Dialog } from "./Dialog";

/**
 * "Where the numbers come from" (Stage 10 Part 2). GDD Section 17 marks every number in this game as a
 * real formula, a real measurement or a game value. That belongs on screen, not only in a document, so a
 * player can tell which parts of what they are learning are physics and which are our rules.
 */
export type ProvenanceKind = "formula" | "real" | "game";
export const KIND_ORDER: ProvenanceKind[] = ["formula", "real", "game"];
export const KIND_TITLE: Record<ProvenanceKind, string> = {
  formula: "Real formulas",
  real: "Real numbers",
  game: "Game values",
};
export const KIND_BLURB: Record<ProvenanceKind, string> = {
  formula: "Worked out the way engineers work it out.",
  real: "Measured in the real world, rounded to keep it readable.",
  game: "Chosen by us to make the game fair and fun.",
};

/** The footnote that appears under a checks panel, with the button that opens the full list. */
export function ProvenanceNote({ text, className }: { text?: string; className?: string } = {}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  // closing puts the keyboard back on the button that opened it
  const close = useCallback(() => {
    setOpen(false);
    buttonRef.current?.focus();
  }, []);
  return (
    <p className={"provenance-note muted small" + (className ? " " + className : "")}>
      {text ?? "Fuel, power, signal and launch windows come from real formulas. Costs and points are game values."}{" "}
      <button ref={buttonRef} type="button" className="link" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
        Where the numbers come from
      </button>
      {open && <ProvenancePanel onClose={close} />}
    </p>
  );
}

/** The list itself, grouped into formulas, real numbers and game values. */
export function ProvenancePanel({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="Where the numbers come from" titleId="provenance-title" closeLabel="Close the list of where the numbers come from"
      className="provenance" onClose={onClose}>
      <p className="muted small">Everything in this game is one of three things.</p>
      {KIND_ORDER.map((kind) => {
        const rows = (provenance as { what: string; kind: string; detail: string }[]).filter((r) => r.kind === kind);
        if (rows.length === 0) return null;
        return (
          <section key={kind} className="prov-group">
            <h4>{KIND_TITLE[kind]} <span className="muted">— {KIND_BLURB[kind]}</span></h4>
            <ul>
              {rows.map((r) => (
                <li key={r.what}>
                  <span className={"prov-tag " + kind}>{KIND_TITLE[kind].replace(/s$/, "")}</span>
                  <b>{r.what}</b>
                  <br />
                  <span className="muted">{r.detail}</span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </Dialog>
  );
}
