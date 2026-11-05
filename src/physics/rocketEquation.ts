/**
 * The rocket equation (Tsiolkovsky).
 * Δv = Isp × g0 × ln(fullMass / emptyMass)
 * - isp in seconds, masses in kg, result in km/s.
 */
export const G0 = 9.80665; // m/s², Earth gravity

/** Speed change (km/s) the fuel can give. */
export function deltaV(isp: number, fullMassKg: number, emptyMassKg: number): number {
  if (fullMassKg <= emptyMassKg || emptyMassKg <= 0) return 0;
  return (isp * G0 * Math.log(fullMassKg / emptyMassKg)) / 1000;
}

/** Fuel (kg) needed to give a spacecraft of `emptyMassKg` a Δv of `dvKmS`. */
export function fuelNeeded(isp: number, emptyMassKg: number, dvKmS: number): number {
  return emptyMassKg * (Math.exp((dvKmS * 1000) / (isp * G0)) - 1);
}

/**
 * Fuel (kg) actually burned when a spacecraft of `fullMassKg` (dry mass + all fuel on board)
 * changes speed by `dvKmS`. Extra fuel on board is dead weight during the burn, so this is
 * more than `fuelNeeded` for the dry mass alone.
 */
export function fuelBurned(isp: number, fullMassKg: number, dvKmS: number): number {
  if (fullMassKg <= 0 || dvKmS <= 0) return 0;
  return fullMassKg * (1 - Math.exp(-(dvKmS * 1000) / (isp * G0)));
}
