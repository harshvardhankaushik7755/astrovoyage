import { useEffect } from "react";
import { useGame } from "../store/gameStore";
import { confirmBlip, selectBlip, uiClick } from "../sound/sound";

/**
 * Click sounds for the whole game, from one listener on the page, so no screen has to think about them.
 * A main (blue) button gives a rising "yes", any other button a quiet tick, and ticking a part on or
 * off a bloop that rises or falls. A button with data-sound="none" (Launch, the sound switch) makes
 * its own sound instead. Silent while sound is off.
 */
export function UiSounds() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const muted = useGame.getState().muted;
      if (muted) return;
      const el = e.target as HTMLElement | null;
      if (!el?.closest) return;
      // a click on a part card reaches the card's own radio or checkbox as a second click: sound that one
      if (el instanceof HTMLInputElement && (el.type === "radio" || el.type === "checkbox")) {
        selectBlip(muted, el.type === "radio" || el.checked);
        return;
      }
      const button = el.closest("button");
      if (!button || button.disabled || button.dataset.sound === "none") return;
      if (button.classList.contains("primary")) confirmBlip(muted);
      else uiClick(muted);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
  return null;
}
