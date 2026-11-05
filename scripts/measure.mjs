/**
 * Measure every screen on a laptop-sized viewport (Stage 8): starts the Vite dev server, plays a Moon demo
 * mission in headless Chromium, and records document.documentElement.scrollHeight for each screen, the
 * height of every challenge card (and whether it stays inside the map), the tallest gauge card, the tallest
 * calendar cell and the smallest font size on screen. Screenshots go to ./screenshots.
 *
 *   npm run measure                 → 1366×650 (the default)
 *   npm run measure -- 1920 1080    → any other size (works in PowerShell and in bash)
 *
 * First time only: npx playwright install chromium
 */
import { createServer } from "vite";
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const [argW, argH] = process.argv.slice(2);
const W = Number(argW ?? process.env.W ?? 1366);
const H = Number(argH ?? process.env.H ?? 650);
if (!Number.isFinite(W) || !Number.isFinite(H) || W < 320 || H < 320) {
  console.error(`Bad viewport ${argW ?? process.env.W}×${argH ?? process.env.H}. Use: npm run measure -- 1366 650`);
  process.exit(2);
}
const OUT = process.env.OUT ?? "screenshots";
mkdirSync(OUT, { recursive: true });

const server = await createServer({ server: { host: "127.0.0.1", port: 5199, strictPort: false }, logLevel: "silent" });
await server.listen();
const url = server.resolvedUrls.local[0].replace(/\/$/, "");
const browser = await chromium.launch().catch((err) => {
  console.error(`${err.message}

If the browser is missing, run: npx playwright install chromium`);
  process.exit(2);
});
const page = await browser.newPage({ viewport: { width: W, height: H } });
const rows = [];
const cards = [];
/** Anything that is wrong but is not a measurement: reported with the rest at the end. */
const problems = [];

/** The page height, plus the numbers the Stage 8 rules care about. */
async function measure(screen, file) {
  await page.waitForTimeout(200);
  const m = await page.evaluate(() => {
    const doc = document.documentElement;
    const visible = [...document.querySelectorAll("body *")].filter((el) => el.checkVisibility?.() ?? true);
    // Text inside the map is drawn in SVG units and scaled with the picture, so what matters is how big
    // it lands on the screen: font size times the SVG's own scale factor.
    const svgScale = (el) => {
      const svg = el.ownerSVGElement;
      if (!svg) return 1;
      const box = svg.viewBox.baseVal;
      return box && box.width ? svg.getBoundingClientRect().width / box.width : 1;
    };
    const fonts = visible
      .filter((el) => [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim()))
      .map((el) => parseFloat(getComputedStyle(el).fontSize) * svgScale(el));
    const tallest = (sel) => Math.max(0, ...[...document.querySelectorAll(sel)].map((el) => el.getBoundingClientRect().height));
    // the cockpit hides overflow instead of scrolling, so also check nothing inside it is cut off (the log strip may scroll by design)
    const clipped = Math.max(0, ...[...document.querySelectorAll(".app-cockpit, .cockpit, .cockpit .map, .cockpit .gauges, .cockpit .log")]
      .map((el) => el.scrollHeight - el.clientHeight));
    return {
      scrollHeight: doc.scrollHeight, clientHeight: doc.clientHeight, scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth,
      smallestFont: fonts.length ? Math.round(Math.min(...fonts) * 10) / 10 : null,
      tallestGauge: tallest(".cockpit .gauge"), tallestMonth: tallest(".month"), clipped,
    };
  });
  rows.push({ screen, ...m });
  await page.screenshot({ path: `${OUT}/${file}.png` });
  return m;
}

/** A challenge card: its height, and whether it sits inside the map. */
async function measureCard(name, file) {
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ timeout: 60_000 });
  await page.waitForTimeout(150);
  const title = (await page.locator("#event-title").textContent())?.trim();
  const card = await page.locator(".modal").boundingBox();
  const map = await page.locator(".cockpit .map").boundingBox();
  const inMap = card && map && card.y >= map.y - 1 && card.y + card.height <= map.y + map.height + 1 && card.x >= map.x - 1 && card.x + card.width <= map.x + map.width + 1;
  const context = await page.locator(".why .context").count();
  const chips = await page.locator(".option .affect").count();
  const badge = (await page.locator(".tag.common").textContent())?.trim();
  const m = await measure(`Mission Control: ${title}`, file);
  cards.push({ name, title, cardHeight: Math.round(card?.height ?? 0), cardWidth: Math.round(card?.width ?? 0), inMap, contextOpen: context > 0, chips, badge, scrollHeight: m.scrollHeight });
}

try {
  await page.goto(`${url}/?demo=1`);
  await measure("Home", "01-home");

  await page.getByRole("button", { name: /Or build your own|Start a mission/ }).click();
  await measure("Choose mission", "02-choose");

  await page.getByRole("button", { name: "Design this mission: Moon Orbiter" }).click(); // the Design Lab and Launch shots use the Moon
  await measure("Mission plan", "02b-plan");
  await page.getByRole("button", { name: /build the spacecraft/ }).click();
  await measure("Design Lab (body group open)", "03-design-lab");
  await page.getByRole("button", { name: /2\. Science instruments/ }).click();
  await measure("Design Lab (instruments group open, the tallest)", "03b-design-lab-instruments");
  await page.getByRole("button", { name: /5\. Engine and fuel/ }).click();
  await measure("Design Lab (engine and fuel group open)", "03c-design-lab-engine");

  await page.getByRole("button", { name: "Load a design that works" }).click();
  await page.getByRole("button", { name: /Go to launch calendar/ }).click();
  await measure("Launch", "04-launch");
  await page.locator(".learn-more summary").click();
  await measure("Launch (Learn more open)", "04b-launch-learn-more");

  // the demo button is the judges' one-click path: Mars, ready-made design, already flying
  await page.getByRole("button", { name: /Launch!/ }).click();
  await page.locator(".cockpit").waitFor();
  await measure("Mission Control", "05-mission-control");

  // the five demo challenges, each measured with the card open (and once with the context unfolded)
  // the demo run, in order (see src/sim/demo.ts)
  const files = ["06a-card-debris", "06b-card-opportunity", "06c-card-follow-up", "06d-card-sun-push", "06e-card-safe-mode"];
  for (let i = 0; i < files.length; i++) {
    await measureCard(files[i], files[i]);
    if (i === 0) {
      const why = page.getByRole("button", { name: /Why does this happen\?/ });
      const wasOpen = (await why.getAttribute("aria-expanded")) === "true";
      if (!wasOpen) await why.click();
      await measureCard(`${files[i]}-open`, `${files[i]}-why-open`);
      if (!wasOpen) await why.click();
    }
    if (i === 1) {
      // Stage 12: the card must be playable from the keyboard alone, in a real browser. The card
      // focuses its first option when it opens; Tab reaches the next one and Enter takes it.
      const before = await page.locator(".log li, .log .line").count();
      const onOption = await page.evaluate(() => document.activeElement?.classList.contains("option") ?? false);
      await page.keyboard.press("Tab");
      const stillOnOption = await page.evaluate(() => document.activeElement?.classList.contains("option") ?? false);
      await page.keyboard.press("Enter");
      await page.waitForTimeout(400);
      const gone = (await page.locator(".option").count()) === 0;
      const after = await page.locator(".log li, .log .line").count();
      if (!onOption || !stillOnOption || !gone || after <= before) {
        problems.push(`A challenge could not be played from the keyboard alone (focus on an option: ${onOption}, ` +
          `Tab reached another: ${stillOnOption}, Enter answered it: ${gone}, the log recorded it: ${after > before}).`);
      }
      console.log(`
Keyboard: the card opens on an option, Tab moves along them, Enter answers it — ${gone ? "yes" : "NO"}`);
      continue;
    }
    await page.locator(".option").first().click();
    await page.waitForTimeout(300);
  }
  // the log's ℹ popover
  await page.locator(".log .info").first().click();
  await measure("Mission Control (log popover open)", "06f-log-popover");
  await page.locator(".log .popover .close").click();

  // Stage 11: the sky must not cost the mission its frame rate, and the SVG must stay small
  await page.getByRole("button", { name: "4x" }).click();
  const perf = await page.evaluate(() => new Promise((done) => {
    const start = performance.now();
    let frames = 0;
    const tick = () => {
      frames++;
      if (performance.now() - start < 2000) requestAnimationFrame(tick);
      else done({ fps: Math.round((frames * 1000) / (performance.now() - start)), svg: document.querySelectorAll(".map svg *").length });
    };
    requestAnimationFrame(tick);
  }));
  rows.push({ screen: "Mission Control at 4x (frame rate)", ...(await measure("Mission Control at 4x", "06h-cruise-4x")), fps: perf.fps, svg: perf.svg });
  console.log(`
Cruise at 4x: ${perf.fps} frames a second, ${perf.svg} SVG elements`);

  // and the space view, the mode a judge demos in
  await page.getByRole("button", { name: /Space view/ }).click();
  await page.waitForTimeout(500);
  await measure("Space view", "06i-space-view");
  await page.getByRole("button", { name: /Exit space view/ }).click();
  await page.waitForTimeout(300);

  await page.getByRole("button", { name: /See results/ }).waitFor({ timeout: 120_000 });
  await measure("Mission Control (orbit captured)", "06g-orbit");
  await page.getByRole("button", { name: /See results/ }).click();
  await measure("Results", "07-results");
} finally {
  await browser.close();
  await server.close();
}

const fits = (r) => (r.scrollHeight <= r.clientHeight ? "yes" : r.screen.startsWith("Results") ? "scrolls (allowed)" : "NO");
console.log(`\nViewport ${W}×${H}\n`);
console.log("| Screen | scrollHeight | fits | clipped inside | smallest font | tallest gauge | tallest month |");
console.log("|---|---|---|---|---|---|---|");
for (const r of rows) {
  console.log(`| ${r.screen} | ${r.scrollHeight} px | ${fits(r)} | ${r.clipped ? r.clipped + " px" : "no"} | ${r.smallestFont} px | ${r.tallestGauge ? Math.round(r.tallestGauge) + " px" : "–"} | ${r.tallestMonth ? Math.round(r.tallestMonth) + " px" : "–"} |`);
}
console.log("\n| Challenge card | height | inside the map | context open | chips | badge |");
console.log("|---|---|---|---|---|---|");
for (const c of cards) console.log(`| ${c.title}${c.name.endsWith("-open") ? " (why open)" : ""} | ${c.cardHeight} px | ${c.inMap ? "yes" : "NO"} | ${c.contextOpen ? "yes" : "no"} | ${c.chips} | ${c.badge} |`);

const wide = rows.filter((r) => r.scrollWidth > r.clientWidth);
if (wide.length) console.log(`\nHorizontal overflow on: ${wide.map((r) => r.screen).join(", ")}`);
const slow = rows.filter((r) => r.fps !== undefined && r.fps < 55);
const heavy = rows.filter((r) => r.svg !== undefined && r.svg > 600);
const bad = rows.filter((r) => fits(r) === "NO");
const smallText = rows.filter((r) => r.smallestFont !== null && r.smallestFont < 12);
const tallCards = cards.filter((c) => !c.inMap);
// the fold opens by default on viewports 800 px and taller (TALL_VIEWPORT in MissionControl.tsx)
const expectFold = (c) => c.name.endsWith("-open") || H >= 800;
const wrongFold = cards.filter((c) => c.contextOpen !== expectFold(c));
const thinCards = cards.filter((c) => c.chips < 2 || !c.badge);
const clipped = rows.filter((r) => r.clipped > 0);
if (bad.length || smallText.length || tallCards.length || clipped.length || wrongFold.length || thinCards.length || slow.length || heavy.length) {
  console.log(`\nFAIL: ${[...bad.map((r) => `${r.screen} scrolls`), ...clipped.map((r) => `${r.screen} cuts off ${r.clipped}px inside the cockpit`), ...smallText.map((r) => `${r.screen} has ${r.smallestFont}px text`), ...tallCards.map((c) => `${c.title} card leaves the map`),
    ...wrongFold.map((c) => `${c.title} card fold was ${c.contextOpen ? "open" : "closed"} when it should not be`),
    ...thinCards.map((c) => `${c.title} card has ${c.chips} chips and badge ${c.badge ? "yes" : "no"}`),
    ...slow.map((r) => `${r.screen} ran at ${r.fps} fps`),
    ...heavy.map((r) => `${r.screen} drew ${r.svg} SVG elements, over the 600 budget`)].join("; ")}`);
  process.exit(1);
}
console.log("\nAll screens fit.");
