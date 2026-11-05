import { useGame } from "../store/gameStore";
import { confirmBlip, unlockAudio } from "../sound/sound";

/** Sound on/off. Off by default. Turning it on happens inside a click, which is what browsers need to allow audio. */
export function MuteButton() {
  const muted = useGame((s) => s.muted);
  const toggleMute = useGame((s) => s.toggleMute);
  return (
    <button
      className="mute"
      aria-pressed={!muted}
      aria-label={muted ? "Sound is off. Turn sound on" : "Sound is on. Turn sound off"}
      title={muted ? "Sound is off" : "Sound is on"}
      data-sound="none"
      onClick={() => {
        if (muted) {
          unlockAudio();
          confirmBlip(false); // so the player hears straight away that sound now works
        }
        toggleMute();
      }}
    >
      <span aria-hidden="true">{muted ? "🔇" : "🔊"}</span><span className="btn-text">{muted ? " Sound off" : " Sound on"}</span>
    </button>
  );
}
