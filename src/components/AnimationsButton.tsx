import { useGame } from "../store/gameStore";

/**
 * The short beat that plays over the map when a challenge arrives, on or off (Stage 12 Part 3).
 * On by default. Turning it off keeps it off for the rest of the session, and the card opens at once
 * instead — nothing about the mission changes either way, because the engine stops the clock anyway.
 */
export function AnimationsButton() {
  const skip = useGame((s) => s.skipAnimations);
  const toggle = useGame((s) => s.toggleSkipAnimations);
  return (
    <button
      className="animations"
      aria-pressed={!skip}
      aria-label={skip ? "Challenge animations are off. Turn them on" : "Challenge animations are on. Turn them off"}
      title={skip ? "Challenge animations are off" : "Challenge animations are on"}
      onClick={toggle}
    >
      <span aria-hidden="true">🎬</span><span className="btn-text">{skip ? " Animations off" : " Animations on"}</span>
    </button>
  );
}
