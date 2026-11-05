/**
 * Getting into orbit around the target (Stage 17). Real two-body formulas, no game values.
 *
 * The spacecraft arrives on a hyperbola with a speed "far away" of v∞. At the closest point (periapsis, radius rp)
 * its speed is sqrt(v∞² + 2μ/rp) (energy conservation). To stay, it brakes to the speed of the wanted ellipse at
 * that same point, from the vis-viva equation v = sqrt(μ (2/r − 1/a)). The braking burn is the difference.
 * A long oval orbit needs much less braking than a low circle: that is why Mangalyaan and Juno use ovals.
 */
export interface OrbitShape {
  /** Lowest height above the surface, km. */
  periapsisKm: number;
  /** Highest height above the surface, km. Equal to periapsisKm for a circle. */
  apoapsisKm: number;
}

export interface PlanetBody {
  /** Gravitational parameter μ = G·M, km³/s². */
  muKm3s2: number;
  radiusKm: number;
  /** Arrival speed far from the planet (v∞), km/s. */
  arrivalSpeedKmS: number;
}

/** Braking burn (km/s) to go from the arrival hyperbola into this orbit, burning at the lowest point. */
export function captureDeltaV(body: PlanetBody, orbit: OrbitShape): number {
  const rp = body.radiusKm + orbit.periapsisKm;
  const ra = body.radiusKm + Math.max(orbit.apoapsisKm, orbit.periapsisKm);
  const a = (rp + ra) / 2;
  const arriving = Math.sqrt(body.arrivalSpeedKmS ** 2 + (2 * body.muKm3s2) / rp);
  const inOrbit = Math.sqrt(body.muKm3s2 * (2 / rp - 1 / a));
  return arriving - inOrbit;
}

/** Time for one trip round the orbit, in hours (Kepler's third law: T = 2π √(a³/μ)). */
export function orbitPeriodHours(body: PlanetBody, orbit: OrbitShape): number {
  const a = body.radiusKm + (orbit.periapsisKm + Math.max(orbit.apoapsisKm, orbit.periapsisKm)) / 2;
  return (2 * Math.PI * Math.sqrt(a ** 3 / body.muKm3s2)) / 3600;
}

/** "2 hours", "3 days", "53 days" — the period in words a 12-year-old reads at a glance. */
export function formatPeriod(hours: number): string {
  if (hours < 48) return `${Math.round(hours)} hours`;
  const days = Math.round(hours / 24);
  return `${days} days`;
}
