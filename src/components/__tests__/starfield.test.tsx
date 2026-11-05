// @vitest-environment jsdom
/**
 * Stage 11 Part 1: the sky is drawn once and never again.
 * The spacecraft moves sixty times a second; if the stars were redrawn with it the map would crawl,
 * and on a slow laptop the mission would stutter. This test is what keeps that honest.
 */
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { renderToString } from "react-dom/server";
import { Starfield, skyRenders } from "../Starfield";
import skyData from "../../data/sky.json";

let root: Root | null = null;
let host: HTMLDivElement | null = null;

/** A map that redraws every frame, exactly as Mission Control does, with the sky inside it. */
function Map({ day }: { day: number }) {
  return (
    <svg viewBox="0 0 640 400">
      <Starfield viewW={640} viewH={400} />
      <circle className="ship" cx={day} cy={10} r={2} />
    </svg>
  );
}

beforeEach(() => {
  skyRenders.count = 0;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

describe("the sky is drawn once", () => {
  it("does not redraw when the mission clock advances", () => {
    act(() => root!.render(<Map day={0} />));
    expect(skyRenders.count).toBe(1);
    const firstSky = host!.querySelector(".sky")!.innerHTML;

    // sixty frames of the spacecraft moving
    for (let day = 1; day <= 60; day++) act(() => root!.render(<Map day={day} />));
    expect(host!.querySelector(".ship")!.getAttribute("cx")).toBe("60");
    expect(skyRenders.count, "the sky was redrawn while the spacecraft moved").toBe(1);
    expect(host!.querySelector(".sky")!.innerHTML).toBe(firstSky);
  });

  it("draws again only when the map itself changes size", () => {
    act(() => root!.render(<Starfield viewW={640} viewH={400} />));
    expect(skyRenders.count).toBe(1);
    act(() => root!.render(<Starfield viewW={640} viewH={400} />));
    expect(skyRenders.count).toBe(1);
    act(() => root!.render(<Starfield viewW={1280} viewH={800} />));
    expect(skyRenders.count).toBe(2);
  });
});

describe("the sky on screen", () => {
  it("renders the same SVG every time, and hides itself from screen readers", () => {
    const a = renderToString(<Starfield viewW={640} viewH={400} />);
    const b = renderToString(<Starfield viewW={640} viewH={400} />);
    expect(a).toBe(b);
    expect(a).toContain('aria-hidden="true"');
    expect(a).toContain('class="sky"');
  });

  it("draws every star, the band, the galaxies and the nebula", () => {
    const html = renderToString(<Starfield viewW={640} viewH={400} />);
    const count = (needle: string) => html.split(needle).length - 1;
    expect(count('class="sky-star')).toBe(skyData.stars.count);
    expect(count('class="sky-band"')).toBe(1);
    expect(count('class="sky-galaxy"')).toBe(skyData.galaxies.count);
    expect(count('class="sky-nebula"')).toBe(skyData.nebulae.count);
    expect(html).not.toContain("twinkle"); // off by default
  });

  it("uses no mission class, so nothing decorative can be mistaken for the mission", () => {
    const html = renderToString(<Starfield viewW={640} viewH={400} />);
    for (const missionClass of ['class="orbit"', 'class="trail"', 'class="ship"', 'class="label"', 'class="glow"']) {
      expect(html, missionClass).not.toContain(missionClass);
    }
  });
});
