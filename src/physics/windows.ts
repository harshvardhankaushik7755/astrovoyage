/**
 * Launch windows (simplified game rule).
 * A scenario has a windowMonths cycle (Mars 26, Jupiter 13, Moon 0 = any month)
 * and a windowOffset (which month of the calendar the first window opens).
 * Month index 0 = January of the first calendar year.
 */
export type WindowStatus = "open" | "near" | "closed" | "any";

export interface WindowResult {
  status: WindowStatus;
  /** Extra Δv multiplier: 1.0 inside window, up to 1.3 near, Infinity when closed. */
  dvMultiplier: number;
  /** Months from the chosen month to the nearest window centre. */
  monthsOff: number;
  message: string;
}

export function checkWindow(month: number, windowMonths: number, windowOffset: number): WindowResult {
  if (windowMonths <= 0) {
    return { status: "any", dvMultiplier: 1, monthsOff: 0, message: "The Moon is close. You can launch any month." };
  }
  // distance to the nearest window centre, on a repeating cycle
  const rel = ((month - windowOffset) % windowMonths + windowMonths) % windowMonths;
  const monthsOff = Math.min(rel, windowMonths - rel);
  if (monthsOff <= 1) return { status: "open", dvMultiplier: 1, monthsOff, message: "Launch window is open. Normal fuel needed." };
  if (monthsOff <= 3) {
    const mult = 1 + 0.1 * (monthsOff - 1); // 1.1 or 1.2 (game rule)
    return { status: "near", dvMultiplier: mult, monthsOff, message: `You are ${monthsOff} months from the window. You need ${Math.round((mult - 1) * 100)}% more fuel.` };
  }
  return { status: "closed", dvMultiplier: Infinity, monthsOff, message: "The planet is on the wrong side of the Sun. Wait for the next window." };
}

/** Which calendar months (0..totalMonths-1) are inside a window — for drawing the green band. */
export function windowMonthsList(windowMonths: number, windowOffset: number, totalMonths: number): number[] {
  const out: number[] = [];
  for (let m = 0; m < totalMonths; m++) {
    if (checkWindow(m, windowMonths, windowOffset).status !== "closed") out.push(m);
  }
  return out;
}

export type Route = "fast" | "slow";
/** Fast route: less time, more fuel. Slow route: more time, less fuel. (Game values.) */
export const ROUTE = {
  fast: { dvMultiplier: 1.15, timeMultiplier: 0.75, label: "Fast route" },
  slow: { dvMultiplier: 0.9, timeMultiplier: 1.4, label: "Slow route" },
} as const;

/** The route in words for the player, e.g. "15% more fuel, 25% shorter trip". */
export function routeDescription(route: Route): string {
  const { dvMultiplier, timeMultiplier } = ROUTE[route];
  const fuel = `${Math.round(Math.abs(dvMultiplier - 1) * 100)}% ${dvMultiplier > 1 ? "more" : "less"} fuel`;
  const time = `${Math.round(Math.abs(timeMultiplier - 1) * 100)}% ${timeMultiplier < 1 ? "shorter" : "longer"} trip`;
  return `${fuel}, ${time}`;
}
