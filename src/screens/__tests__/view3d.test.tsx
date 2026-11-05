/**
 * Stage 15: the 3D view button. The scene itself needs WebGL, which a test runner does not have, so
 * this checks the switch: the button is there, and pressing it swaps the flat map for the 3D view.
 */
import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import view from "../../data/view3d.json";
import { MissionView } from "../MissionControl";
import { createSimulation, step } from "../../sim/simulation";
import { runChecks, findScenario, type Design } from "../../physics/checks";

const noop = () => {};
const MOON: Design = { bodyId: "small", instrumentIds: ["camera", "magnetometer"], powerId: "solarSmall", antennaId: "antSmall", engineId: "chemical", rocketId: "medium", fuelKg: 1400 };
const sc = findScenario("moon");
const sim = step(createSimulation(MOON, sc, 3, "slow", runChecks(MOON, sc, 3, "slow"), 1, []), 1);

const render = (show3d: boolean) => renderToString(
  <MissionView sim={sim} design={MOON} speed={1} onSpeed={noop} fx={{ arrival: null, flash: null, countdown: null, burning: false }}
    instruments={["Camera", "Magnetometer"]} clockOffset={0} clockFlash={false} shake={false} secondsLeft={null}
    contextOpen={false} onToggleContext={noop} openInfo={null} onOpenInfo={noop} spaceView={false} onToggleSpace={noop}
    show3d={show3d} onToggle3d={noop} onDecide={noop} onSeeResults={noop} />,
);

describe("3D view button", () => {
  it("is in the top bar, off, with the flat map showing", () => {
    const h = render(false);
    expect(h).toContain(view.text.button);
    expect(h).toMatch(/class="toggle-3d"[^>]*aria-pressed="false"/);
    expect(h).toContain('aria-label="Map of the flight to Moon"');
  });

  it("when on, the flat map gives way to the 3D view and the button offers the way back", () => {
    const h = render(true);
    expect(h).toContain(view.text.buttonOff);
    expect(h).toMatch(/class="toggle-3d on"[^>]*aria-pressed="true"/);
    expect(h).not.toContain('aria-label="Map of the flight to Moon"');
    expect(h).toContain(view.text.loading); // the three.js part arrives on its own, after the click
  });
});
