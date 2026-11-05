/**
 * The 3D view of the flight (three.js). Loaded only when the player presses "3D view", so the game's
 * first download does not carry it.
 *
 * Everything is placed by src/sim/scene3d.ts from the real simulation: the same planet angles, the
 * same Kepler transfer path and the same spacecraft position as the flat map. The spacecraft is built
 * from shipLayout(), so it is the one the player designed. Sizes are exaggerated so things can be seen,
 * and the view says so.
 */
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import view from "../../data/view3d.json";
import { parkingOffset, scene3d, type BodyKey, type Vec3 } from "../../sim/scene3d";
import { shipLayout, type ShipPiece } from "../../sim/shipLayout";
import type { SimState } from "../../sim/simulation";
import type { Design } from "../../physics/checks";
import { glowTexture, panelTexture, planetTexture, type TextureKind } from "./textures";

export interface Flight3DProps {
  sim: SimState;
  design: Design;
  path: { radiusAU: number; angleRad: number }[];
  coastDays: number;
  burning: boolean;
  /** the map box in SVG units, so the 3D view takes exactly the flat map's place */
  viewW: number;
  viewH: number;
}

type Mode = "overview" | "follow";
const T = view.text;
const R = view.sceneRadius;

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export default function Flight3D(props: Flight3DProps) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const [mode, setMode] = useState<Mode>("overview");
  const [spin, setSpin] = useState(() => !reducedMotion());
  const [failed, setFailed] = useState(false);
  const controlRef = useRef<{ setMode: (m: Mode) => void; setSpin: (on: boolean) => void } | null>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      setFailed(true);
      return;
    }
    const { sim, design } = latest.current;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    el.appendChild(renderer.domElement);
    const labels = new CSS2DRenderer();
    labels.domElement.className = "labels3d";
    el.appendChild(labels.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#03050d");
    const camera = new THREE.PerspectiveCamera(view.camera.fov, 1, 0.01, 2000);
    const home = new THREE.Vector3(0, R * view.camera.startHeight * 1.6, R * view.camera.startDistance);
    camera.position.copy(home);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 0.3;
    controls.maxDistance = R * view.camera.maxDistance;
    controls.autoRotateSpeed = view.camera.autoSpinSpeed;
    // the moment the player grabs the view, it is theirs: the slow spin stops and any camera move ends
    let flying: { pos: THREE.Vector3; target: THREE.Vector3 } | null = null;
    controls.addEventListener("start", () => { flying = null; setSpin(false); });

    const disposables: { dispose: () => void }[] = [];
    const keep = <D extends { dispose: () => void }>(d: D) => { disposables.push(d); return d; };

    // --- stars: a shell of points, with a denser band for the Milky Way ---
    {
      const r = mulberry(7);
      const n = view.starCount;
      const pos = new Float32Array(n * 3);
      const col = new Float32Array(n * 3);
      const band = new THREE.Euler(0.9, 0.3, 0.2);
      for (let i = 0; i < n; i++) {
        const inBand = i % 5 < 2;
        const theta = r() * Math.PI * 2;
        const phi = inBand ? Math.PI / 2 + (r() - 0.5) * 0.35 : Math.acos(2 * r() - 1);
        const v = new THREE.Vector3().setFromSphericalCoords(view.starShell, phi, theta);
        if (inBand) v.applyEuler(band);
        pos.set([v.x, v.y, v.z], i * 3);
        const tint = r();
        const c = tint < 0.15 ? [1, 0.85, 0.7] : tint < 0.35 ? [0.75, 0.85, 1] : [1, 1, 1];
        const b = 0.45 + r() * 0.55;
        col.set([c[0] * b, c[1] * b, c[2] * b], i * 3);
      }
      const geo = keep(new THREE.BufferGeometry());
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
      scene.add(new THREE.Points(geo, keep(new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true }))));
    }

    const s0 = scene3d(sim, latest.current.path, latest.current.coastDays);

    // --- light: the Sun in the middle, or a far-away Sun for trips round Earth ---
    scene.add(new THREE.AmbientLight(0xffffff, view.lights.ambient));
    if (s0.centre === "sun") {
      scene.add(new THREE.PointLight(0xfff4e0, view.lights.sun, 0, 0));
    } else {
      const sunDir = new THREE.Vector3(-1, 0.25, 0.6).normalize();
      const light = new THREE.DirectionalLight(0xfff4e0, view.lights.sun * 0.9);
      light.position.copy(sunDir.clone().multiplyScalar(50));
      scene.add(light);
      const far = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: keep(glowTexture("#fff7d6", "rgba(255,190,80,0.6)")), blending: THREE.AdditiveBlending, depthWrite: false })));
      far.position.copy(sunDir.multiplyScalar(view.starShell * 0.8));
      far.scale.setScalar(18);
      scene.add(far);
    }

    // --- bodies ---
    const makeLabel = (text: string, cls = "") => {
      const div = document.createElement("div");
      div.className = "label3d " + cls;
      div.textContent = text;
      return new CSS2DObject(div);
    };
    const makeBody = (key: BodyKey) => {
      const b = view.bodies[key];
      const group = new THREE.Group();
      const geo = keep(new THREE.SphereGeometry(b.radius, 64, 32));
      const map = keep(planetTexture(b.texture as TextureKind));
      const mat = keep(key === "sun"
        ? new THREE.MeshBasicMaterial({ map })
        : new THREE.MeshStandardMaterial({ map, roughness: 0.92, metalness: 0 }));
      const ball = new THREE.Mesh(geo, mat);
      group.add(ball);
      if (key === "sun") {
        // kept small enough that a spacecraft out at Jupiter's distance is not sitting inside the glow
        for (const [size, inner, outer] of [[5, "rgba(255,240,190,0.9)", "rgba(255,170,60,0.35)"], [9, "rgba(255,200,120,0.2)", "rgba(255,140,40,0.05)"]] as const) {
          const glow = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: keep(glowTexture(inner, outer)), blending: THREE.AdditiveBlending, depthWrite: false })));
          glow.scale.setScalar(b.radius * size);
          group.add(glow);
        }
      } else if (key !== "moon") {
        group.add(atmosphere(b.radius, b.color, key === "jupiter" ? 0.5 : 0.9, keep));
      }
      const label = makeLabel(b.name);
      label.position.set(0, b.radius + 0.28, 0);
      group.add(label);
      scene.add(group);
      return { group, ball, spin: b.spin, radius: b.radius };
    };
    const centre = makeBody(s0.centreBody);
    const earth = s0.centre === "sun" ? makeBody("earth") : null;
    const target = makeBody(s0.targetBody);

    // --- orbits: thin dashed rings in the plane of the planets ---
    for (const o of s0.orbits) {
      const pts = Array.from({ length: 257 }, (_, i) => {
        const a = (i / 256) * Math.PI * 2;
        return new THREE.Vector3(o.radius * Math.cos(a), 0, o.radius * Math.sin(a));
      });
      const geo = keep(new THREE.BufferGeometry().setFromPoints(pts));
      const color = o.id === "earth" ? "#4f8cff" : view.bodies[s0.targetBody].color;
      const ring = new THREE.Line(geo, keep(new THREE.LineDashedMaterial({ color, dashSize: 0.22, gapSize: 0.16, transparent: true, opacity: 0.45 })));
      ring.computeLineDistances();
      scene.add(ring);
    }

    // --- the path: the whole plan faint, the part already flown bright ---
    const pathPts = s0.path.map(v3);
    const planGeo = keep(new THREE.BufferGeometry().setFromPoints(pathPts));
    const plan = new THREE.Line(planGeo, keep(new THREE.LineDashedMaterial({ color: "#8fc2ff", dashSize: 0.12, gapSize: 0.12, transparent: true, opacity: 0.28 })));
    plan.computeLineDistances();
    scene.add(plan);
    const trailGeo = keep(new THREE.BufferGeometry().setFromPoints(pathPts));
    scene.add(new THREE.Line(trailGeo, keep(new THREE.LineBasicMaterial({ color: "#9fd0ff", transparent: true, opacity: 0.95 }))));

    // --- the spacecraft the player built ---
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = keep(pmrem.fromScene(new RoomEnvironment(), 0.04).texture);
    pmrem.dispose();
    const ship = buildShip(design, env, keep);
    scene.add(ship.group);
    const marker = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: keep(glowTexture("rgba(220,240,255,1)", "rgba(110,190,255,0.5)")), blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: false })));
    marker.scale.setScalar(0.045 * view.ship.glowSize * 2);
    scene.add(marker);
    const shipLabel = makeLabel(T.you, "you");
    scene.add(shipLabel);

    // --- size, camera moves and the buttons ---
    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      labels.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    let currentMode: Mode = "overview";
    const shipNow = new THREE.Vector3();
    controlRef.current = {
      setMode: (m) => {
        currentMode = m;
        if (m === "overview") {
          flying = { pos: home.clone(), target: new THREE.Vector3() };
        } else {
          const back = new THREE.Vector3(-ship.heading.x, 0, -ship.heading.z).multiplyScalar(view.ship.followDistance);
          flying = { pos: shipNow.clone().add(back).add(new THREE.Vector3(0, view.ship.followDistance * 0.55, 0)), target: shipNow.clone() };
        }
      },
      setSpin: (on) => { controls.autoRotate = on; },
    };
    controls.autoRotate = spin;

    // --- every frame: read the live simulation and move everything to where it is now ---
    const clock = new THREE.Clock();
    let raf = 0;
    const prevShip = new THREE.Vector3();
    let first = true;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, clock.getDelta());
      const t = clock.elapsedTime;
      const p = latest.current;
      const s = scene3d(p.sim, p.path, p.coastDays);

      if (earth) earth.group.position.copy(v3(s.earth));
      target.group.position.copy(v3(s.target));
      for (const b of [centre, earth, target]) if (b) b.ball.rotation.y += b.spin * dt;

      let pos = v3(s.ship);
      let heading = s.heading;
      if (s.inOrbit) {
        // captured: the spacecraft goes round the planet it reached
        const o = parkingOffset(t, target.radius);
        pos = pos.add(v3(o));
        const o2 = parkingOffset(t + 0.05, target.radius);
        const d = new THREE.Vector3(o2.x - o.x, 0, o2.z - o.z).normalize();
        heading = { x: d.x, y: 0, z: d.z };
      }
      shipNow.copy(pos);
      ship.group.position.copy(pos);
      ship.heading = heading;
      ship.group.rotation.y = Math.atan2(-heading.z, heading.x);
      marker.position.copy(pos);
      marker.material.opacity = 0.75 + 0.25 * Math.sin(t * 3);
      // below the spacecraft, so it never sits on a planet's name above it (they start side by side at launch)
      shipLabel.position.copy(pos).add(new THREE.Vector3(0, -0.3, 0));
      // the flame burns while the engine does: always a soft blue for ion, a bright plume for chemical burns
      ship.flame.visible = p.burning || ship.ion;
      ship.flame.scale.setScalar((p.burning ? 1 : 0.55) * (0.85 + 0.15 * Math.sin(t * 40)));

      trailGeo.setDrawRange(0, s.inOrbit ? s.path.length : s.flown + 1);

      // follow mode: the camera rides along with the spacecraft, keeping whatever angle the player chose
      if (currentMode === "follow" && !first && !flying) {
        const delta = pos.clone().sub(prevShip);
        camera.position.add(delta);
        controls.target.add(delta);
      }
      if (flying) {
        const goal = currentMode === "follow" ? flying.target.copy(pos) : flying.target;
        camera.position.lerp(flying.pos, 0.07);
        controls.target.lerp(goal, 0.1);
        if (currentMode === "follow") {
          const back = new THREE.Vector3(-heading.x, 0, -heading.z).multiplyScalar(view.ship.followDistance);
          flying.pos.copy(pos).add(back).add(new THREE.Vector3(0, view.ship.followDistance * 0.55, 0));
        }
        if (camera.position.distanceTo(flying.pos) < 0.02 && controls.target.distanceTo(goal) < 0.02) flying = null;
      }
      prevShip.copy(pos);
      first = false;

      controls.update();
      renderer.render(scene, camera);
      labels.render(scene, camera);
    };
    frame();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      for (const d of disposables) d.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
      el.removeChild(labels.domElement);
      controlRef.current = null;
    };
    // the scene is built once per mission; every frame after that reads the latest props from the ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { controlRef.current?.setMode(mode); }, [mode]);
  useEffect(() => { controlRef.current?.setSpin(spin); }, [spin]);

  if (failed) return <div className="view3d failed" style={{ aspectRatio: `${props.viewW} / ${props.viewH}` }}><p>{T.failed}</p></div>;
  return (
    <div className="view3d" style={{ aspectRatio: `${props.viewW} / ${props.viewH}` }}>
      <div ref={host} className="view3d-canvas" role="img" aria-label="3D view of the flight. Drag to turn it, scroll to zoom." />
      <div className="view3d-tools" role="group" aria-label="3D camera">
        <button className={mode === "overview" ? "on" : ""} aria-pressed={mode === "overview"} onClick={() => setMode("overview")}>{T.overview}</button>
        <button className={mode === "follow" ? "on" : ""} aria-pressed={mode === "follow"} onClick={() => setMode("follow")}>{T.follow}</button>
        <button className={spin ? "on" : ""} aria-pressed={spin} onClick={() => setSpin((v) => !v)}>{T.spin}</button>
      </div>
      <p className="view3d-note">{`${T.hint} · ${T.scale}`}</p>
    </div>
  );
}

const v3 = (v: Vec3) => new THREE.Vector3(v.x, v.y, v.z);

function mulberry(seed: number) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A thin glowing shell, brightest at the edge, the way an atmosphere looks from space. */
function atmosphere(radius: number, color: string, strength: number, keep: <D extends { dispose: () => void }>(d: D) => D) {
  const mat = keep(new THREE.ShaderMaterial({
    uniforms: { c: { value: new THREE.Color(color) }, k: { value: strength } },
    vertexShader: `varying vec3 vN; varying vec3 vV;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 c; uniform float k; varying vec3 vN; varying vec3 vV;
      void main() { float f = pow(1.0 - max(dot(vN, vV), 0.0), 2.5); gl_FragColor = vec4(c, f * k); }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  return new THREE.Mesh(keep(new THREE.SphereGeometry(radius * 1.1, 48, 24)), mat);
}

/**
 * The spacecraft as 3D parts, from the same layout as the map sprite and the challenge schematic.
 * Layout x is the nose (+x here) and layout y is the side (z here); each flat box gets a thickness.
 */
function buildShip(design: Design, env: THREE.Texture, keep: <D extends { dispose: () => void }>(d: D) => D) {
  const layout = shipLayout(design);
  const u = view.ship.unitsPerShipUnit;
  const group = new THREE.Group();
  const panelMap = keep(panelTexture());
  const mats = {
    bus: keep(new THREE.MeshStandardMaterial({ color: "#d9a93c", metalness: 0.9, roughness: 0.32, envMap: env })),
    panel: keep(new THREE.MeshStandardMaterial({ map: panelMap, metalness: 0.5, roughness: 0.3, envMap: env, emissive: "#0b1d4d", emissiveIntensity: 0.6 })),
    white: keep(new THREE.MeshStandardMaterial({ color: "#f1f4ff", metalness: 0.2, roughness: 0.45, envMap: env })),
    grey: keep(new THREE.MeshStandardMaterial({ color: "#9aa3b8", metalness: 0.8, roughness: 0.3, envMap: env })),
    dark: keep(new THREE.MeshStandardMaterial({ color: "#2b2f3a", metalness: 0.6, roughness: 0.4, envMap: env })),
    rtg: keep(new THREE.MeshStandardMaterial({ color: "#6b5a3a", metalness: 0.7, roughness: 0.4, envMap: env })),
    grid: keep(new THREE.MeshStandardMaterial({ color: "#3d6bff", emissive: "#2a50ff", emissiveIntensity: 0.8, metalness: 0.4, roughness: 0.3 })),
  };
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, p: ShipPiece, y = 0) => {
    const m = new THREE.Mesh(keep(geo), mat);
    m.position.set(p.x * u, y, p.y * u);
    group.add(m);
    return m;
  };
  const alongX = (m: THREE.Mesh) => { m.rotation.z = Math.PI / 2; return m; };
  for (const p of layout.pieces) {
    const w = p.w * u, h = p.h * u;
    if (p.shape === "bus") add(new THREE.BoxGeometry(w, h * 0.9, h), mats.bus, p);
    else if (p.shape === "panel") {
      const m = add(new THREE.BoxGeometry(w, 0.004, h), mats.panel, p);
      panelMap.repeat.set(1, Math.max(1, Math.round(p.h / p.w)));
      m.rotation.x = 0.15; // tilted a touch towards the light, as real wings are
    } else if (p.shape === "rtg") alongX(add(new THREE.CylinderGeometry(h / 2, h / 2, w, 16), mats.rtg, p));
    else if (p.shape === "mast") add(new THREE.BoxGeometry(w, 0.006, 0.006), mats.grey, p);
    else if (p.shape === "dish") {
      const m = add(new THREE.SphereGeometry(h / 2, 32, 12, 0, Math.PI * 2, 0, Math.PI / 3.2), mats.white, p);
      m.rotation.z = Math.PI / 2; // the bowl faces forward, along the nose
      m.scale.set(1, (w / h) * 2.2, 1);
    } else if (p.shape === "sensor") add(new THREE.BoxGeometry(w, w, h), mats.dark, p, (layout.h * u) * 0.12);
    else if (p.shape === "nozzle") { const m = alongX(add(new THREE.CylinderGeometry(h * 0.18, h / 2, w, 24, 1, true), mats.grey, p)); m.rotation.z = -Math.PI / 2; }
    else if (p.shape === "grid") alongX(add(new THREE.CylinderGeometry(h / 2, h / 2, w, 24), mats.grid, p));
  }
  // the engine plume, from the back of this ship
  const tail = Math.min(...layout.pieces.map((p) => p.x - p.w / 2)) * u;
  const ion = layout.pieces.some((p) => p.shape === "grid");
  const plumeLen = 0.18;
  const flame = new THREE.Mesh(
    keep(new THREE.ConeGeometry(0.03, plumeLen, 16, 1, true)),
    keep(new THREE.MeshBasicMaterial({ color: ion ? "#7fb0ff" : "#ffb347", transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })),
  );
  flame.geometry.translate(0, -plumeLen / 2, 0); // grow out of the nozzle, not from the middle
  flame.rotation.z = Math.PI / 2;
  const flameHolder = new THREE.Group();
  flameHolder.position.set(tail, 0, 0);
  flameHolder.add(flame);
  group.add(flameHolder);
  // bigger designs are drawn bigger, but no spacecraft is lost in the dark
  const size = Math.max(layout.w, layout.h) * u;
  group.scale.setScalar(Math.max(1, 0.22 / size));
  return { group, flame: flameHolder, ion, heading: { x: 1, y: 0, z: 0 } as Vec3 };
}
