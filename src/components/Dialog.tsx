import { useEffect, useRef, type ReactNode } from "react";

/**
 * The one dialog behaviour this game uses, in one place: focus starts on Close, Tab stays inside,
 * Escape or a click outside shuts it, and closing puts the keyboard back where it was.
 * The word list and "Where the numbers come from" both use it, so there is only ever one focus trap.
 */
const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** What a key press inside a dialog should do. Pure, so it can be tested without a browser. */
export type DialogKeyAction = "close" | "toFirst" | "toLast" | "none";
export function dialogKeyAction(key: string, shiftKey: boolean, atFirst: boolean, atLast: boolean): DialogKeyAction {
  if (key === "Escape") return "close";
  if (key !== "Tab") return "none";
  if (shiftKey && atFirst) return "toLast";
  if (!shiftKey && atLast) return "toFirst";
  return "none";
}

export function Dialog({ title, titleId, closeLabel, className, onClose, children }: {
  title: string;
  titleId: string;
  closeLabel: string;
  className?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const modalRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      const focusable = Array.from(modalRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const action = dialogKeyAction(e.key, e.shiftKey, document.activeElement === first, document.activeElement === last);
      if (action === "close") onClose();
      else if (action === "toLast" && last) {
        e.preventDefault();
        last.focus();
      } else if (action === "toFirst" && first) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="overlay" onClick={onClose}>
      <div ref={modalRef} className={"modal " + (className ?? "")} role="dialog" aria-modal="true" aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}>
        <div className="row between">
          <h3 id={titleId}>{title}</h3>
          <button ref={closeRef} onClick={onClose} aria-label={closeLabel}>✕ Close</button>
        </div>
        {children}
      </div>
    </div>
  );
}
