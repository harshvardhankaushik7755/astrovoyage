/**
 * Communication check (simplified game rule).
 * The antenna has a data rate near Earth. Far away, less signal reaches Earth,
 * so the scenario gives a commsFactor (Moon 1.0, Mars 0.1, Jupiter 0.01).
 * Instruments need a certain data rate to send everything home.
 */
export function dataReturnedFraction(antennaRate: number, commsFactor: number, dataNeed: number): number {
  if (dataNeed <= 0) return 1;
  return Math.min(1, (antennaRate * commsFactor) / dataNeed);
}

/** Light takes 8.317 minutes to cross one astronomical unit. A real number, not a game value. */
export const LIGHT_MINUTES_PER_AU = 8.317;

/** One-way signal delay in plain words: seconds close to home, minutes and hours further out. */
export function formatSignalDelay(minutes: number): string {
  if (minutes < 1) {
    const s = minutes * 60;
    return `${s < 10 ? s.toFixed(1) : Math.round(s)} seconds`;
  }
  const m = Math.round(minutes);
  if (m < 120) return m === 1 ? "1 minute" : `${m} minutes`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} hours ${rest} minutes` : `${h} hours`;
}
