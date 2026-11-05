// @vitest-environment jsdom
/**
 * Stage 10 Part 2: the one dialog behaviour, and the list of where the numbers come from.
 * These run in a DOM so the keyboard can really be pressed: Escape closes, and the keyboard
 * goes back to the button that opened the dialog.
 */
import { describe, it, expect, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import provenance from "../../data/provenance.json";
import { dialogKeyAction } from "../Dialog";
import { ProvenanceNote, KIND_ORDER, KIND_TITLE } from "../Provenance";
import { Glossary } from "../Glossary";

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function mount(node: React.ReactNode) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(node));
  return host;
}
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});
const press = (key: string, shiftKey = false) =>
  act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey, bubbles: true })); });
const click = (el: Element) => act(() => { (el as HTMLElement).click(); });

describe("what a key does inside a dialog", () => {
  it("Escape always closes; Tab only wraps at the ends", () => {
    expect(dialogKeyAction("Escape", false, false, false)).toBe("close");
    expect(dialogKeyAction("Escape", true, true, true)).toBe("close");
    expect(dialogKeyAction("Tab", false, false, true)).toBe("toFirst");
    expect(dialogKeyAction("Tab", true, true, false)).toBe("toLast");
    expect(dialogKeyAction("Tab", false, true, false)).toBe("none");
    expect(dialogKeyAction("Tab", true, false, true)).toBe("none");
    expect(dialogKeyAction("a", false, true, true)).toBe("none");
  });
});

describe("the data behind the list", () => {
  it("every row says what it is, which kind it is, and why", () => {
    expect(provenance.length).toBeGreaterThanOrEqual(9);
    for (const row of provenance) {
      expect(KIND_ORDER, row.what).toContain(row.kind);
      expect(row.what.length, row.what).toBeGreaterThan(3);
      expect(row.detail.length, row.what).toBeGreaterThan(30);
    }
    // all three kinds are really used, or a group would render empty
    for (const kind of KIND_ORDER) expect(provenance.some((r) => r.kind === kind), kind).toBe(true);
  });
});

describe("Where the numbers come from", () => {
  it("opens from the footnote, shows all three groups, and closes with Escape back onto the button", () => {
    const el = mount(<ProvenanceNote />);
    const button = el.querySelector("button.link")!;
    expect(button.textContent).toContain("Where the numbers come from");
    expect(document.querySelector('[role="dialog"]')).toBeNull();

    click(button);
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog).not.toBeNull();
    expect(button.getAttribute("aria-expanded")).toBe("true");
    for (const kind of KIND_ORDER) expect(dialog.textContent).toContain(KIND_TITLE[kind]);
    expect(dialog.querySelectorAll(".prov-tag").length).toBe(provenance.length);
    // focus starts inside the dialog, on Close
    expect(document.activeElement?.getAttribute("aria-label")).toContain("Close the list");

    press("Escape");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(button); // the keyboard is back where it started
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  it("a click outside closes it too", () => {
    const el = mount(<ProvenanceNote />);
    click(el.querySelector("button.link")!);
    click(document.querySelector(".overlay")!);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});

describe("the word list uses the same dialog", () => {
  it("closes with Escape and gives the keyboard back to the ? button", () => {
    const el = mount(<Glossary />);
    const help = el.querySelector("button.help")!;
    click(help);
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    press("Escape");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(help);
  });
});
