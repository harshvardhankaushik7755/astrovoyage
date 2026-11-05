import { describe, it, expect } from "vitest";
import { launchWhoosh, alertBeep, rumble, getContext, uiClick, confirmBlip, selectBlip, countdownTick, successChime, failTone, burnRoar, startHum } from "../sound";

type Ctx = NonNullable<Parameters<typeof alertBeep>[1]>;

/** A fake AudioContext that records what was connected and started. */
function fakeContext(): { calls: string[]; ctx: Ctx } {
  const calls: string[] = [];
  const param = () => {
    const p = { value: 0, setValueAtTime: () => p, exponentialRampToValueAtTime: () => p };
    return p;
  };
  const node = (kind: string) => ({
    type: "", buffer: null, Q: param(), frequency: param(), gain: param(),
    connect: () => calls.push(`connect:${kind}`),
    start: () => calls.push(`start:${kind}`),
    stop: () => calls.push(`stop:${kind}`),
  });
  const ctx = {
    currentTime: 0,
    sampleRate: 8000,
    destination: {},
    createOscillator: () => node("osc"),
    createGain: () => node("gain"),
    createBiquadFilter: () => node("filter"),
    createBuffer: (_channels: number, length: number) => ({ getChannelData: () => new Float32Array(length) }),
    createBufferSource: () => node("noise"),
  } as unknown as Ctx;
  return { calls, ctx };
}

describe("sounds", () => {
  it("stay silent while muted, and when there is no AudioContext", () => {
    const { calls, ctx } = fakeContext();
    expect(launchWhoosh(true, ctx)).toBe(false);
    expect(alertBeep(true, ctx)).toBe(false);
    expect(calls).toEqual([]);
    expect(getContext()).toBeNull(); // Node has no AudioContext
    expect(launchWhoosh(false, null)).toBe(false);
    expect(alertBeep(false, null)).toBe(false);
  });

  it("the launch whoosh plays filtered noise once", () => {
    const { calls, ctx } = fakeContext();
    expect(launchWhoosh(false, ctx)).toBe(true);
    expect(calls.filter((c) => c === "start:noise")).toHaveLength(1);
    expect(calls).toContain("connect:filter");
    expect(calls).toContain("stop:noise");
  });

  it("the alert is two short beeps", () => {
    const { calls, ctx } = fakeContext();
    expect(alertBeep(false, ctx)).toBe(true);
    expect(calls.filter((c) => c === "start:osc")).toHaveLength(2);
    expect(calls.filter((c) => c === "stop:osc")).toHaveLength(2);
  });
});

describe("rumble", () => {
  it("plays low filtered noise once, and stays silent when muted", () => {
    const { calls, ctx } = fakeContext();
    expect(rumble(true, ctx)).toBe(false);
    expect(calls).toEqual([]);
    expect(rumble(false, ctx)).toBe(true);
    expect(calls.filter((c) => c === "start:noise")).toHaveLength(1);
    expect(calls).toContain("connect:filter");
  });
});

describe("Stage 16 sounds", () => {
  const notes = (calls: string[]) => calls.filter((c) => c === "start:osc").length;

  it("every one of them is silent while sound is off, and without a sound card", () => {
    const { calls, ctx } = fakeContext();
    for (const f of [uiClick, confirmBlip, successChime, failTone]) {
      expect(f(true, ctx)).toBe(false);
      expect(f(false, null)).toBe(false);
    }
    expect(selectBlip(true, true, ctx)).toBe(false);
    expect(countdownTick(true, false, ctx)).toBe(false);
    expect(burnRoar(true, 1, ctx)).toBe(false);
    expect(startHum(true, ctx)).toBeNull();
    expect(startHum(false, null)).toBeNull();
    expect(calls).toEqual([]);
  });

  it("a click is one note, a main button two, a chime four rising notes", () => {
    let f = fakeContext();
    expect(uiClick(false, f.ctx)).toBe(true);
    expect(notes(f.calls)).toBe(1);
    f = fakeContext();
    confirmBlip(false, f.ctx);
    expect(notes(f.calls)).toBe(2);
    f = fakeContext();
    successChime(false, f.ctx);
    expect(notes(f.calls)).toBe(4);
    f = fakeContext();
    failTone(false, f.ctx);
    expect(notes(f.calls)).toBe(2);
  });

  it("picking a part and a countdown tick are one short note each", () => {
    for (const play of [(c: Ctx) => selectBlip(false, true, c), (c: Ctx) => selectBlip(false, false, c), (c: Ctx) => countdownTick(false, true, c)]) {
      const f = fakeContext();
      expect(play(f.ctx)).toBe(true);
      expect(notes(f.calls)).toBe(1);
    }
  });

  it("the burn is one stretch of filtered noise", () => {
    const { calls, ctx } = fakeContext();
    expect(burnRoar(false, 1.2, ctx)).toBe(true);
    expect(calls.filter((c) => c === "start:noise")).toHaveLength(1);
    expect(calls).toContain("stop:noise");
  });

  it("the hum keeps playing until it is stopped, and stopping twice is harmless", () => {
    const { calls, ctx } = fakeContext();
    const hum = startHum(false, ctx)!;
    expect(hum).not.toBeNull();
    expect(notes(calls)).toBe(3);
    expect(calls.filter((c) => c === "start:noise")).toHaveLength(1);
    expect(calls.some((c) => c.startsWith("stop:"))).toBe(false);
    hum.setLevel(4);
    hum.setLevel(0);
    hum.stop();
    hum.stop();
    expect(calls.filter((c) => c === "stop:osc")).toHaveLength(3);
    expect(calls.filter((c) => c === "stop:noise")).toHaveLength(1);
    hum.setLevel(1); // after stopping, nothing happens
  });
});
