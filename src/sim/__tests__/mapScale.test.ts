/**
 * Stage 11 Part 4: the scale bar is honest at every zoom and on every mission.
 */
import { describe, it, expect } from "vitest";
import { scaleBar } from "../mapScale";
import { AU_KM } from "../simulation";

describe("the scale bar measures the map it is drawn on", () => {
  it("never claims a length it was not drawn at", () => {
    for (const pxPerAU of [4, 40, 112, 900, 66000]) {
      for (const target of [60, 90, 140]) {
        const bar = scaleBar(pxPerAU, target);
        // the bar really is as long as the AU it names, at this map's own scale
        expect(bar.lengthPx).toBeCloseTo(bar.au * pxPerAU, 6);
        expect(bar.lengthPx, `${pxPerAU} px/AU`).toBeLessThanOrEqual(target + 0.001);
        expect(bar.au).toBeGreaterThan(0);
      }
    }
  });

  it("picks a round number a child can read, not an exact one", () => {
    expect(scaleBar(112, 90).au).toBe(0.5); // a Mars map: half an AU fits in 90 units
    expect(scaleBar(33, 90).au).toBe(2); // a Jupiter map: whole AU
    expect(scaleBar(66000, 90).au).toBe(0.001); // a Moon map: thousandths
  });

  it("says the same distance twice, in AU and in kilometres", () => {
    const mars = scaleBar(112, 90);
    expect(mars.label).toContain("0.5 AU");
    expect(mars.label).toContain(`${Math.round((0.5 * AU_KM) / 1e6)} million km`);

    // close to home, thousands of kilometres are the numbers people know
    const moon = scaleBar(66000, 90);
    expect(moon.label).toContain("0.001 AU");
    expect(moon.label).toContain("thousand km");
    expect(moon.label).not.toContain("million");
  });

  it("still gives a bar when the map is far too zoomed out for its smallest step", () => {
    const tiny = scaleBar(1, 10);
    expect(tiny.au).toBeGreaterThan(0);
    expect(tiny.label).toContain("AU");
  });
});
