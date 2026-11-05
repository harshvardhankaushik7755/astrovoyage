/**
 * The 3D view's geometry: where everything is, in scene units. Pure, no three.js, so it can be tested.
 *
 * It is the flat map lifted into space, from the same numbers: the planets' angles, the spacecraft's
 * radius and angle, and the Kepler transfer path all come from the simulation. Orbits lie in the
 * ecliptic plane (y = 0). The map's "up" (+sin) is −z here, so a camera looking down from +y with −z
 * at the top of the screen sees exactly the flat map.
 */
import view from "../data/view3d.json";
import { coastAngles, EARTH_ORBIT_AU, type SimState } from "./simulation";

export interface Vec3 { x: number; y: number; z: number }
export type BodyKey = keyof typeof view.bodies;

export interface Scene3D {
  /** what sits in the middle: the Sun, or Earth for Moon trips */
  centre: "sun" | "earth";
  unitsPerAU: number;
  /** the body drawn in the middle, and the two that move */
  centreBody: BodyKey;
  targetBody: BodyKey;
  earth: Vec3;
  target: Vec3;
  ship: Vec3;
  /** unit vector the spacecraft is flying along, in the orbit plane */
  heading: Vec3;
  orbits: { id: "earth" | "target"; radius: number }[];
  path: Vec3[];
  /** index of the last point of `path` already flown */
  flown: number;
  inOrbit: boolean;
}

export const toVec = (radiusAU: number, angleRad: number, k: number): Vec3 =>
  ({ x: radiusAU * k * Math.cos(angleRad), y: 0, z: -radiusAU * k * Math.sin(angleRad) });

/** The scene body for a scenario's target. Unknown targets borrow Mars's look rather than breaking. */
export function targetBodyFor(scenarioId: string): BodyKey {
  return scenarioId in view.bodies ? (scenarioId as BodyKey) : "mars";
}

export function scene3d(sim: SimState, path: { radiusAU: number; angleRad: number }[], coastDays = 0): Scene3D {
  const c = sim.config;
  const earthCentred = c.centralBody === "earth";
  // the outermost orbit sits at sceneRadius, the same rule the flat map uses for its edge
  const k = view.sceneRadius / Math.max(c.targetOrbitRadiusAU, earthCentred ? 0 : EARTH_ORBIT_AU);
  const sky = coastDays > 0 ? coastAngles(sim, coastDays) : sim;
  const target = toVec(c.targetOrbitRadiusAU, sky.targetAngleRad, k);
  const earth = earthCentred ? { x: 0, y: 0, z: 0 } : toVec(EARTH_ORBIT_AU, sky.earthAngleRad, k);
  const inOrbit = sim.phase === "orbit";
  // once captured the spacecraft rides with its planet, so it is drawn there (the view adds the little orbit)
  const ship = inOrbit ? { ...target } : toVec(sim.spacecraft.radiusAU, sim.spacecraft.angleRad, k);
  const pts = path.map((p) => toVec(p.radiusAU, p.angleRad, k));
  const flown = Math.max(0, Math.min(pts.length - 1, Math.floor((sim.missionDay / sim.totalDays) * (pts.length - 1))));

  // heading: towards the next path point, or along the last stretch at the end of the path
  const next = pts[Math.min(pts.length - 1, flown + 1)] ?? ship;
  let d = { x: next.x - ship.x, y: 0, z: next.z - ship.z };
  if (Math.hypot(d.x, d.z) < 1e-6 && flown > 0) d = { x: ship.x - pts[flown - 1].x, y: 0, z: ship.z - pts[flown - 1].z };
  const len = Math.hypot(d.x, d.z) || 1;
  const heading = { x: d.x / len, y: 0, z: d.z / len };

  return {
    centre: earthCentred ? "earth" : "sun",
    unitsPerAU: k,
    centreBody: earthCentred ? "earthCentral" : "sun",
    targetBody: targetBodyFor(c.scenarioId),
    earth, target, ship, heading,
    orbits: earthCentred
      ? [{ id: "target", radius: c.targetOrbitRadiusAU * k }]
      : [{ id: "earth", radius: EARTH_ORBIT_AU * k }, { id: "target", radius: c.targetOrbitRadiusAU * k }],
    path: pts, flown, inOrbit,
  };
}

/** Where the spacecraft is on its little parking orbit round the planet, `t` seconds into the animation. */
export function parkingOffset(t: number, planetRadius: number): Vec3 {
  const r = planetRadius * view.ship.parkingOrbit;
  const a = (2 * Math.PI * t) / view.ship.parkingOrbitSeconds;
  // tilted a little out of the orbit plane, so it reads as going round, not sliding side to side
  return { x: r * Math.cos(a), y: r * 0.35 * Math.sin(a), z: -r * Math.sin(a) };
}

/**
 * How far to turn a solar wing about its long axis so its face points at the Sun.
 * (sunX, sunY) is the direction to the Sun in the spacecraft's own frame (x = nose, y = up); the wing lies flat
 * (facing +y) at 0. Turning by θ about the long axis points the face along (−sin θ, cos θ), so θ = atan2(−x, y).
 */
export function panelAngle(sunX: number, sunY: number): number {
  return Math.atan2(-sunX, sunY);
}
