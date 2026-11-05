/**
 * Planet surfaces painted on a canvas, so the 3D view needs no image files.
 * Each is a simple equirectangular map (2:1) wrapped round a sphere. A seeded random keeps every
 * planet looking the same each time the view opens.
 */
import * as THREE from "three";

export type TextureKind = "sun" | "earth" | "moon" | "mars" | "jupiter";

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { c, g: c.getContext("2d")! };
}

/** A soft blob made of overlapping circles, for continents, dark plains and dust regions. */
function blob(g: CanvasRenderingContext2D, r: () => number, x: number, y: number, size: number, color: string, alpha: number) {
  g.fillStyle = color;
  g.globalAlpha = alpha;
  for (let i = 0; i < 14; i++) {
    const a = r() * Math.PI * 2;
    const d = r() * size;
    g.beginPath();
    g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.6, size * (0.35 + r() * 0.5), 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
}

function paint(kind: TextureKind, g: CanvasRenderingContext2D, w: number, h: number) {
  const r = rng(kind.length * 7919 + 17);
  if (kind === "earth") {
    const sea = g.createLinearGradient(0, 0, 0, h);
    sea.addColorStop(0, "#0d3b7a"); sea.addColorStop(0.5, "#1a64c4"); sea.addColorStop(1, "#0d3b7a");
    g.fillStyle = sea; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 16; i++) blob(g, r, r() * w, h * (0.2 + r() * 0.6), 18 + r() * 34, ["#2f7d3b", "#5d8a3a", "#8a7a4a"][i % 3], 0.85);
    g.fillStyle = "#f4f8ff"; g.fillRect(0, 0, w, h * 0.06); g.fillRect(0, h * 0.94, w, h * 0.06);
    g.strokeStyle = "rgba(255,255,255,0.55)"; g.lineCap = "round";
    for (let i = 0; i < 40; i++) {
      g.lineWidth = 2 + r() * 5;
      const x = r() * w, y = h * (0.1 + r() * 0.8);
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 30, y - 8 + r() * 16, x + 50 + r() * 60, y); g.stroke();
    }
  } else if (kind === "mars") {
    g.fillStyle = "#b5502a"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 18; i++) blob(g, r, r() * w, h * (0.15 + r() * 0.7), 14 + r() * 30, i % 2 ? "#7a3018" : "#d47c4c", 0.45);
    g.fillStyle = "#f6efe8"; g.beginPath(); g.ellipse(w / 2, 0, w * 0.5, h * 0.07, 0, 0, Math.PI * 2); g.fill();
  } else if (kind === "jupiter") {
    const palette = ["#efe2c4", "#c99a6b", "#a86b45", "#f4ead6", "#b98a5e", "#dcc29a"];
    let y = 0;
    while (y < h) {
      const band = 5 + r() * 16;
      g.fillStyle = palette[Math.floor(r() * palette.length)];
      g.fillRect(0, y, w, band + 1);
      y += band;
    }
    g.strokeStyle = "rgba(120,70,40,0.25)"; g.lineWidth = 2;
    for (let i = 0; i < 30; i++) {
      const yy = r() * h;
      g.beginPath();
      for (let x = 0; x <= w; x += 16) g.lineTo(x, yy + Math.sin(x / 30 + i) * 3);
      g.stroke();
    }
    g.fillStyle = "#b5532f"; g.beginPath(); g.ellipse(w * 0.66, h * 0.64, w * 0.045, h * 0.04, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "#e8c9a6"; g.lineWidth = 2; g.stroke();
  } else if (kind === "moon") {
    g.fillStyle = "#a3a3a3"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9; i++) blob(g, r, r() * w, h * (0.25 + r() * 0.5), 16 + r() * 26, "#6c6c6c", 0.5);
    for (let i = 0; i < 90; i++) {
      const x = r() * w, y = r() * h, s = 1.5 + r() * 7;
      g.fillStyle = "rgba(70,70,70,0.55)"; g.beginPath(); g.arc(x, y, s, 0, Math.PI * 2); g.fill();
      g.strokeStyle = "rgba(220,220,220,0.45)"; g.lineWidth = 1; g.beginPath(); g.arc(x - 0.6, y - 0.6, s, Math.PI, Math.PI * 1.8); g.stroke();
    }
  } else {
    // the Sun: hot core colours with a boiling, grainy surface
    g.fillStyle = "#ffcc4d"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = r() > 0.5 ? "rgba(255,240,170,0.5)" : "rgba(255,140,40,0.35)";
      g.beginPath(); g.arc(r() * w, r() * h, 1 + r() * 3, 0, Math.PI * 2); g.fill();
    }
  }
}

export function planetTexture(kind: TextureKind): THREE.CanvasTexture {
  const { c, g } = canvas(512, 256);
  paint(kind, g, 512, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** A round glow that fades to nothing, for the Sun's corona and the spacecraft's marker light. */
export function glowTexture(inner: string, outer: string): THREE.CanvasTexture {
  const { c, g } = canvas(128, 128);
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.35, outer);
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Solar cells: dark blue squares with silver lines, so the panels read as panels up close. */
export function panelTexture(): THREE.CanvasTexture {
  const { c, g } = canvas(64, 64);
  g.fillStyle = "#1a3a8c"; g.fillRect(0, 0, 64, 64);
  g.strokeStyle = "#9fb4e8"; g.lineWidth = 1.5;
  for (let i = 0; i <= 64; i += 16) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 64); g.stroke();
    g.beginPath(); g.moveTo(0, i); g.lineTo(64, i); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
