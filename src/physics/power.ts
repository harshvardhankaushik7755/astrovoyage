/**
 * Sunlight follows the inverse-square rule:
 * power at distance d (in AU) = power near Earth ÷ d²
 */
export function solarPowerAt(powerAt1AU: number, distanceAU: number): number {
  if (distanceAU <= 0) return powerAt1AU;
  return powerAt1AU / (distanceAU * distanceAU);
}

/** Power made by a source at the target. RTG gives the same power everywhere. */
export function powerMade(source: { type: string; powerAt1AU: number }, distanceAU: number): number {
  return source.type === "rtg" ? source.powerAt1AU : solarPowerAt(source.powerAt1AU, distanceAU);
}
