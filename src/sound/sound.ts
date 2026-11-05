/**
 * Two tiny sounds made with the Web Audio API. No audio files.
 * Everything stays silent while `muted` is true (the default in the store), or when the
 * browser has no AudioContext (tests, very old browsers). Each function returns true when it
 * actually played something, so it can be tested with a fake context.
 */

interface MinimalContext {
  currentTime: number;
  sampleRate: number;
  destination: AudioNode;
  createOscillator(): OscillatorNode;
  createGain(): GainNode;
  createBiquadFilter(): BiquadFilterNode;
  createBuffer(channels: number, length: number, sampleRate: number): AudioBuffer;
  createBufferSource(): AudioBufferSourceNode;
}

let shared: AudioContext | null = null;

/** The one AudioContext for the page, created on the first call (must happen after a click or key press). */
export function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!shared) shared = new Ctor();
  if (shared.state === "suspended") void shared.resume();
  return shared;
}

/** Call from the click that turns sound on, so the browser lets us play later. */
export function unlockAudio(): void {
  getContext();
}

/** A short "whoosh": filtered noise sweeping up, fading over about a second. */
export function launchWhoosh(muted: boolean, context?: MinimalContext | null): boolean {
  if (muted) return false; // checked first, so no AudioContext is created while sound is off
  if (context === undefined) context = getContext();
  if (!context) return false;
  const seconds = 1.2;
  const buffer = context.createBuffer(1, Math.floor(context.sampleRate * seconds), context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const noise = context.createBufferSource();
  noise.buffer = buffer;
  const filter = context.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 0.8;
  const t = context.currentTime;
  filter.frequency.setValueAtTime(180, t);
  filter.frequency.exponentialRampToValueAtTime(2400, t + seconds * 0.7);
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.5, t + 0.15);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(context.destination);
  noise.start(t);
  noise.stop(t + seconds);
  return true;
}

/** A low rumble, for a solar storm arriving: deep filtered noise fading over 1.5 seconds. */
export function rumble(muted: boolean, context?: MinimalContext | null): boolean {
  if (muted) return false;
  if (context === undefined) context = getContext();
  if (!context) return false;
  const seconds = 1.5;
  const buffer = context.createBuffer(1, Math.floor(context.sampleRate * seconds), context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const noise = context.createBufferSource();
  noise.buffer = buffer;
  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value = 1;
  filter.frequency.value = 90;
  const t = context.currentTime;
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.6, t + 0.2);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(context.destination);
  noise.start(t);
  noise.stop(t + seconds);
  return true;
}

/** Two short beeps, for a challenge that needs a decision. */
export function alertBeep(muted: boolean, context?: MinimalContext | null): boolean {
  if (muted) return false; // checked first, so no AudioContext is created while sound is off
  if (context === undefined) context = getContext();
  if (!context) return false;
  const t = context.currentTime;
  for (const start of [0, 0.22]) {
    const osc = context.createOscillator();
    osc.type = "sine";
    osc.frequency.value = 880;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, t + start);
    gain.gain.exponentialRampToValueAtTime(0.35, t + start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + start + 0.16);
    osc.connect(gain);
    gain.connect(context.destination);
    osc.start(t + start);
    osc.stop(t + start + 0.18);
  }
  return true;
}

// ---------- Stage 16: game feel ----------

interface Note { freq: number; to?: number; type?: OscillatorType; start?: number; dur: number; vol: number }

/** One short note with a quick fade in and out. The building block for clicks, blips and chimes. */
function note(context: MinimalContext, n: Note): void {
  const t = context.currentTime + (n.start ?? 0);
  const osc = context.createOscillator();
  osc.type = n.type ?? "sine";
  osc.frequency.setValueAtTime(n.freq, t);
  if (n.to) osc.frequency.exponentialRampToValueAtTime(n.to, t + n.dur);
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(n.vol, t + Math.min(0.015, n.dur / 4));
  gain.gain.exponentialRampToValueAtTime(0.0001, t + n.dur);
  osc.connect(gain);
  gain.connect(context.destination);
  osc.start(t);
  osc.stop(t + n.dur + 0.02);
}

/** Plays a list of notes, or nothing at all while muted or without a sound card. */
function play(muted: boolean, context: MinimalContext | null | undefined, notes: Note[]): boolean {
  if (muted) return false; // checked first, so no AudioContext is created while sound is off
  if (context === undefined) context = getContext();
  if (!context) return false;
  for (const n of notes) note(context, n);
  return true;
}

/** A tiny tick for any button. Quiet on purpose: it is heard dozens of times a game. */
export const uiClick = (muted: boolean, context?: MinimalContext | null) =>
  play(muted, context, [{ freq: 1900, to: 1200, type: "triangle", dur: 0.045, vol: 0.06 }]);

/** Two rising notes, for a main button: "yes, let's go". */
export const confirmBlip = (muted: boolean, context?: MinimalContext | null) =>
  play(muted, context, [
    { freq: 660, type: "triangle", dur: 0.09, vol: 0.09 },
    { freq: 990, type: "triangle", start: 0.07, dur: 0.12, vol: 0.09 },
  ]);

/** A soft "bloop" when a part goes on the spacecraft (or comes off: then it falls instead of rising). */
export const selectBlip = (muted: boolean, on = true, context?: MinimalContext | null) =>
  play(muted, context, [{ freq: on ? 520 : 780, to: on ? 880 : 460, type: "sine", dur: 0.11, vol: 0.12 }]);

/** One tick of a countdown. The last ones are higher, so the ear hears time running out. */
export const countdownTick = (muted: boolean, urgent = false, context?: MinimalContext | null) =>
  play(muted, context, [{ freq: urgent ? 1320 : 990, type: "square", dur: 0.05, vol: urgent ? 0.07 : 0.05 }]);

/** A bright four-note chime going up: orbit captured. */
export const successChime = (muted: boolean, context?: MinimalContext | null) =>
  play(muted, context, [523.25, 659.25, 783.99, 1046.5].map((freq, i) => (
    { freq, type: "triangle" as OscillatorType, start: i * 0.12, dur: i === 3 ? 0.9 : 0.35, vol: 0.13 }
  )));

/** A slow falling tone: the spacecraft flew past. */
export const failTone = (muted: boolean, context?: MinimalContext | null) =>
  play(muted, context, [
    { freq: 392, to: 196, type: "sawtooth", dur: 0.9, vol: 0.06 },
    { freq: 294, to: 147, type: "sine", start: 0.15, dur: 1.1, vol: 0.1 },
  ]);

/** The engine burn: a deep roar of noise that swells and dies away over `seconds`. */
export function burnRoar(muted: boolean, seconds = 1.2, context?: MinimalContext | null): boolean {
  if (muted) return false;
  if (context === undefined) context = getContext();
  if (!context) return false;
  const buffer = context.createBuffer(1, Math.floor(context.sampleRate * seconds), context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const noise = context.createBufferSource();
  noise.buffer = buffer;
  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value = 2;
  const t = context.currentTime;
  filter.frequency.setValueAtTime(220, t);
  filter.frequency.exponentialRampToValueAtTime(700, t + seconds * 0.4);
  filter.frequency.exponentialRampToValueAtTime(160, t + seconds);
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.55, t + 0.12);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(context.destination);
  noise.start(t);
  noise.stop(t + seconds);
  return true;
}

/** The cruise hum, while it plays. `level` 0 is a whisper (paused, or a card is open), 1 normal, more is faster. */
export interface Hum { setLevel(level: number): void; stop(): void }

/**
 * The spacecraft's hum while it flies: two low notes a little out of tune (so they slowly beat against each
 * other) over soft filtered noise. Quiet, so it sits under everything else. null while muted.
 */
export function startHum(muted: boolean, context?: MinimalContext | null): Hum | null {
  if (muted) return null;
  if (context === undefined) context = getContext();
  if (!context) return null;
  const ctx = context;
  const t = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, t);
  master.gain.exponentialRampToValueAtTime(0.05, t + 1.2);
  master.connect(ctx.destination);

  const oscs = [55, 55.6, 110.4].map((freq, i) => {
    const o = ctx.createOscillator();
    o.type = i === 2 ? "triangle" : "sine";
    o.frequency.setValueAtTime(freq, t);
    const g = ctx.createGain();
    g.gain.setValueAtTime(i === 2 ? 0.25 : 0.6, t);
    o.connect(g);
    g.connect(master);
    o.start(t);
    return { o, base: freq };
  });

  const seconds = 2;
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  noise.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(380, t);
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.35, t);
  noise.connect(filter);
  filter.connect(ng);
  ng.connect(master);
  noise.start(t);

  let stopped = false;
  return {
    setLevel(level) {
      if (stopped) return;
      const now = ctx.currentTime;
      const l = Math.max(0, level);
      master.gain.exponentialRampToValueAtTime(Math.max(0.0001, 0.05 * Math.min(1.6, 0.35 + 0.65 * l)), now + 0.4);
      // faster is higher: the engine note climbs a little and the rush of noise opens up
      const pitch = 1 + 0.12 * Math.max(0, l - 1);
      for (const { o, base } of oscs) o.frequency.exponentialRampToValueAtTime(base * pitch, now + 0.4);
      filter.frequency.exponentialRampToValueAtTime(380 * (l > 1 ? 1.8 : 1), now + 0.4);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      const now = ctx.currentTime;
      master.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
      for (const { o } of oscs) o.stop(now + 0.45);
      noise.stop(now + 0.45);
    },
  };
}
