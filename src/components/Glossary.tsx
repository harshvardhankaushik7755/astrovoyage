import { useCallback, useRef, useState } from "react";
import glossary from "../data/glossary.json";
import { Dialog } from "./Dialog";

/** The "?" button on the Design Lab. Opens a short word list in simple English (from the GDD). */
export function Glossary() {
  const [open, setOpen] = useState(false);
  const helpRef = useRef<HTMLButtonElement>(null);
  // closing puts the keyboard back where it was: on the "?" button
  const close = useCallback(() => {
    setOpen(false);
    helpRef.current?.focus();
  }, []);
  return (
    <>
      <button ref={helpRef} className="help" aria-label="Help: what do these words mean?" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
        ?
      </button>
      {open && <GlossaryPanel onClose={close} />}
    </>
  );
}

/** The word list as a dialog. The focus trap lives in Dialog, so there is only one of them in the game. */
export function GlossaryPanel({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="Words to know" titleId="glossary-title" closeLabel="Close the word list" className="glossary" onClose={onClose}>
      <dl>
        {glossary.map((g) => (
          <div key={g.term}>
            <dt>{g.term}</dt>
            <dd>{g.meaning}</dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );
}
