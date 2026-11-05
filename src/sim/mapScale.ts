/**
 * The scale bar on the flight map (Stage 11 Part 4).
 *
 * The bar is never a decoration: its length is worked out from the map's own AU-to-pixel factor, so it
 * is honest at every zoom and for every scenario. It picks a round number of AU that comes out close to
 * the length asked for, which is what makes a scale bar readable rather than exact-but-useless.
 */
import { AU_KM } from "./simulation";

/** A round number of AU, from a Moon trip (thousandths) to a Jupiter one (whole AU). */
const NICE_AU = [
  0.0005, 0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10,
];

export interface ScaleBar { au: number; lengthPx: number; label: string }

/**
 * @param pxPerAU how many map units one AU is drawn as
 * @param targetPx roughly how long the bar should be, in map units
 */
export function scaleBar(pxPerAU: number, targetPx: number): ScaleBar {
  const wanted = targetPx / pxPerAU;
  // the largest round number that still fits the length asked for, or the smallest we have
  const au = [...NICE_AU].reverse().find((n) => n <= wanted) ?? NICE_AU[0];
  return { au, lengthPx: au * pxPerAU, label: `${formatAU(au)} · ${formatKm(au)}` };
}

const formatAU = (au: number) => (au >= 1 ? `${au} AU` : `${au} AU`);

/** Millions of kilometres, except close to home where thousands are the numbers people know. */
function formatKm(au: number): string {
  const km = au * AU_KM;
  if (km >= 1e6) {
    const m = km / 1e6;
    return `${m >= 10 ? Math.round(m) : Math.round(m * 10) / 10} million km`;
  }
  return `${Math.round(km / 1000).toLocaleString()} thousand km`;
}
