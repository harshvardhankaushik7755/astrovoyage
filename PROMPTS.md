# Claude Code prompts — AstroVoyage, stage by stage

How to use: open a terminal in the `astrovoyage` folder, run `claude`, and paste ONE stage prompt at a time.
After each stage: run `npm run dev`, play the game once, then run `npm test`. Only then paste the next stage.
Claude Code reads `CLAUDE.md` automatically, so the prompts stay short.

If something breaks, paste: `The game is broken after the last change: <paste the error>. Fix it without changing the design. Run npm test and npm run build to prove it works.`

---

## Stage 0 — Orientation (run this first, once)

```
Read CLAUDE.md, README.md and every file under src/. Then give me:
1. A 10-line summary of how the game works today (screens, store, physics).
2. Any bugs or code smells you notice (do not fix yet).
3. Confirm that `npm test` and `npm run build` pass on your machine.
Do not change any files in this step.
```

---

## Stage 1 — Simulation engine (pure logic, no UI)

```
Build the simulation engine for the cruise phase. Create `src/sim/simulation.ts` (pure TypeScript, no React) and tests in `src/sim/__tests__/simulation.test.ts`.

Requirements:
1. `createSimulation(design, scenario, launchMonth, route, checkResult)` returns a state object with: missionDay (starts 0), totalDays (= checkResult.tripDays), phase ("cruise" | "insertion" | "orbit" | "failed" | "done"), fuelKg, powerW (made at current distance), signalStrength (0–1), signalDelayMinutes, distanceFromEarthAU, scienceCollected, log (array of {day, text}), and pendingEvent (null or an event).
2. `step(state, days)` advances the mission by `days` and returns a NEW state (never mutate). During cruise: distance from Earth grows from 0 to the scenario distance along a simple curved path (use a half-ellipse Hohmann-style transfer: Earth at angle 0, target at angle 180° at arrival); solar power follows inverse-square (reuse `src/physics/power.ts`); signal strength = 1 / (1 + distanceAU)^2 scaled by commsFactor; signalDelayMinutes = distanceAU × 8.3 minutes (light time for 1 AU ≈ 8.3 min; Moon is ~1.3 seconds — handle that as a special case when distance < 0.01 AU).
3. Planet positions: `planetAngle(planet, missionDay, launchMonth)` returns the angle of Earth and the target on their orbits. Earth completes one orbit in 365 days, Mars in 687 days, Jupiter in 4333 days, Moon orbits Earth in 27.3 days. Add orbital periods to `src/data/scenarios.json` (field `targetOrbitDays` and `targetOrbitRadiusAU`) instead of hard-coding.
4. Milestones at 0%, 25%, 50%, 75%, 100% of the trip push a log line ("Left Earth's gravity", "Halfway there", "Mid-course correction", "Approaching target", "Orbit insertion burn").
5. Orbit insertion at 100%: subtract an insertion fuel cost (add `insertionDeltaV` per scenario in scenarios.json: Moon 0.8, Mars 1.0, Jupiter 1.5 km/s) using the rocket equation. If fuel is enough → phase "orbit"; if not → phase "failed" with log "Not enough fuel to slow down. The spacecraft flew past the planet." Use `deltaV`/`fuelNeeded` from `src/physics/rocketEquation.ts`.
6. Time scale helper: `timeScale(totalDays)` returns { daysPerSecond, label } so that the whole cruise takes about 75 real seconds. Label must be human-readable like "1 sec = 1 hour", "1 sec = 4 days", "1 sec = 1 month".
7. Tests: (a) after stepping totalDays the phase is "orbit" for the sensible Moon design used in physics.test.ts; (b) a design with too little fuel ends "failed"; (c) power at Jupiter is ~3.7% of power at Earth; (d) timeScale gives 60–90 seconds for Moon (3 days), Mars (240 days) and Jupiter (1900 days); (e) step never mutates the input state.

Do not build any screen in this stage. Run npm test and npm run build.
```

---

## Stage 2 — Mission Control screen (animation + gauges)

```
Build the Mission Control screen that plays the simulation from Stage 1.

1. Add screen "mission" to the store and a `MissionControl.tsx` in src/screens. The Launch screen's "Launch!" button goes to "mission" instead of "result". When the simulation reaches phase "orbit" or "failed", show a "See results" button that goes to "result".
2. Layout: left = SVG map (Sun in the centre, Earth orbit and target orbit as dashed circles, Earth and target as coloured dots moving at their real relative speeds using planetAngle, spacecraft as a small triangle moving along the transfer path, a faint trail behind it). For the Moon scenario, draw Earth in the centre and the Moon orbiting it instead. Right = gauges.
3. Top bar: mission clock "Day 142 of 240 · 1 sec = 4 days" and buttons Pause / 1x / 4x. Use requestAnimationFrame and the `timeScale` helper. The game must keep running smoothly at 60 fps on a laptop.
4. Gauges (simple horizontal bars like ResourceBars): Fuel (kg left), Power made vs needed (W), Signal strength (%), Signal delay ("Earth hears you after 12 min"), Distance from Earth (million km, and AU in small text), Science collected.
5. Mission log panel at the bottom: newest line on top, shows the milestone messages.
6. Orbit insertion: when the burn happens, briefly flash the spacecraft and animate the fuel gauge dropping. On success show "Orbit captured!" and on failure show the failure message in red.
7. Mobile: at widths under 800px stack map above gauges.
8. Keep all logic in src/sim; the screen only calls `step` on each frame and renders state.

Play through Moon, Mars and Jupiter yourself with the sensible designs and confirm each takes about 60–90 seconds at 1x. Run npm test and npm run build.
```

---

## Stage 3 — Challenges (surprise events with decisions)

```
Add surprise challenges to the simulation and Mission Control screen. Use `src/data/events.json` as the source of events and extend it as needed.

1. In `src/sim/simulation.ts`, schedule 2–4 events per mission at random days between 15% and 85% of the trip (seeded random so tests are repeatable: accept an optional `seed` in createSimulation). Respect `onlyIf` (e.g. dust only when scenario.dustRisk > 0) and `chance`.
2. Each event has 2–3 options. Extend events.json so every event has `options: [{ id, label, effect }]`. Effects are simple keys the engine understands: `fuelCost` (kg), `sciencePenalty` (0–1), `powerPenalty` (0–1), `riskOfFailure` (0–1), `signalPenalty` (0–1), `none`. Example — Solar storm: "Switch instruments off for safety" (sciencePenalty 0.1) vs "Keep working" (riskOfFailure 0.25, or 0.05 if the body has backup systems). Dust on panels: "Shake panels (burn 20 kg fuel)" vs "Do nothing (power −30%)". Course drift: "Correction burn (30 kg fuel)" vs "Ignore (riskOfFailure 0.3 at insertion)". Lost signal: "Switch to large antenna" (only shown if the design has it) vs "Wait a week (science −10%)". Instrument fault: auto-resolves with "Backup instrument took over" if 3 instruments were carried, otherwise sciencePenalty 0.2.
3. When an event fires, set `pendingEvent`, and `step` must not advance time until `resolveEvent(state, optionId)` is called. Effects that protect the player (large bus, RTG, large antenna, 3 instruments) must reduce or remove the penalty and the engine must say so in the log ("Your backup systems protected you").
4. Mission Control: when pendingEvent is set, auto-pause and show a modal card with the event name, a one-line explanation in simple English, the options as big buttons, and a 20-second countdown. If the countdown ends, pick the safest option automatically and log "Mission control chose for you".
5. The results must record every event and the choice made: add `decisions: [{day, event, option, outcome}]` to the sim state.
6. Tests: with a fixed seed, the same events fire on the same days; choosing the risky option can end in "failed"; protection from the large bus removes the storm penalty; time does not advance while pendingEvent is set.

Run npm test and npm run build. Play each scenario once and make sure the modal never blocks the game permanently.
```

---

## Stage 4 — Results, scoring and the AI Flight Director

```
Upgrade the Result screen and add the AI Flight Director.

1. Scoring (GDD Section 8): score = scienceCollected × missionSuccessFraction + moneyLeft. Stars: reached target, full success (no failure, ≥90% science), under budget. Show the decisions list from Stage 3 with a ✅/⚠️ per decision.
2. "Compare with the real mission" card: pick the scenario's realMissions from realMissions.json and show name, agency, year and fact, plus one line comparing the player's design to it (e.g. "You used solar panels at Jupiter, like Juno").
3. Flight Director explanation: create `src/ai/flightDirector.ts` with two paths.
   a) Rule-based fallback (always works offline): builds 3–5 short sentences from the sim state — why it succeeded/failed, the best and worst decision, one tip, one real-mission link. Cover at least the 10 most common outcomes (not enough insertion fuel, power too low at target, weak antenna, storm with no backup, dust ignored, drift ignored, over-carried fuel, over-sized panels, perfect run, over budget).
   b) LLM path: if `import.meta.env.VITE_FLIGHT_DIRECTOR_URL` is set, POST a JSON summary of the sim state (scenario, parts, checks, decisions, outcome — no personal data) to that URL and show the returned text. On any error or a 6-second timeout, silently use the fallback.
4. Add a tiny optional server in `/server` (Node.js, one file, `npm run server`) that takes that JSON, calls an LLM API with a short system prompt ("You are a friendly NASA flight director talking to a 12-year-old. 4 sentences max. Explain why the mission went this way, give one tip, mention one real mission."), and returns the text. Read the API key from an environment variable. Document setup in README.md. The game must work perfectly without the server.
5. Show the explanation in a chat-bubble style card with a Flight Director avatar (simple SVG face or icon, no external images).
6. Tests for the rule-based fallback: each of the 10 outcomes produces a non-empty, distinct explanation.

Run npm test and npm run build.
```

---

## Stage 5 — Polish, balance and deploy

```
Polish the game for judges.

1. Balance pass: play all three scenarios with 3 different designs each (cheap, balanced, over-built). Adjust ONLY the JSON game values so that: Moon is winnable on the first try by a beginner; Mars on a Budget is hard but winnable with an ion engine or careful fuel; Jupiter fails with small solar panels and succeeds with large panels or RTG. Write the designs you tested and the results in `BALANCE_NOTES.md`.
2. Help: add a "?" button on the Design Lab that opens a short glossary (Δv, Isp, launch window, AU, RTG) in simple English — take definitions from the GDD word list.
3. Home screen: a 3-step "How to play" strip and a "Try the tutorial (Moon)" button that pre-selects the Moon scenario.
4. Accessibility: keyboard focus on all buttons, visible focus rings, aria-labels on gauges, colour is never the only signal (add icons/text for red/green).
5. Mobile/tablet: verify every screen at 390px and 820px widths; fix overflow.
6. Sound (optional, small): a short launch whoosh and an alert beep for events, generated with the Web Audio API (no audio files). Add a mute button; default muted.
7. Deploy: add a GitHub Actions workflow that builds and deploys to GitHub Pages on push to main (set Vite `base` correctly). Explain in README how to enable Pages. Also make sure `npm run build` output works when opened from a sub-path.
8. Remove console warnings. Run npm test and npm run build.
```

---

## Stage 6 — Submission pack

```
Prepare the Space Apps submission material.

1. Write `SUBMISSION.md` with: project name, one-paragraph summary, how it addresses the challenge (map each item in the official summary to a game feature), how it uses NASA/ISRO data and real missions, the physics used, the AI Flight Director, team roles placeholders, and a "what we would build next" list.
2. Write a 30-second demo script (`DEMO_SCRIPT.md`): which screens to show in which order, what to click, what to say. The demo must show one failure (Jupiter with small panels) and one success.
3. Add 5 screenshots to `/docs/screenshots` by describing what to capture (I will take them), and reference them in README.md.
4. Update README.md so a judge can run the game in 3 commands.
5. Create a `docs/PITCH.md` with the 30-second pitch from the GDD Section 16 and 5 likely judge questions with short answers (why these numbers, is the physics real, how does the AI work offline, what is simplified, what is the learning goal).
```

---

## One-shot version (only if you want Claude Code to do everything in one long run)

```
Read CLAUDE.md and PROMPTS.md. Execute Stage 1 to Stage 5 in order. After EACH stage: run npm test and npm run build, fix anything that fails, commit with the message "Stage N: <what was done>", and print a 5-line summary before starting the next stage. Never start a stage while the previous one has failing tests. If a stage needs a decision from me, choose the simplest option, note it in DECISIONS.md, and continue. Stop after Stage 5 and list everything in DECISIONS.md.
```

---

## Stage 7 — Show cause and effect (challenge visuals)

Why: today a challenge is a card, a click, and a log line. The player never *sees* what the storm did to the
spacecraft. Like a rainy day at an airport: "Delayed" on a board means little, but rain on the window, a wet
runway and the clock jumping forward make you feel it. This stage makes every challenge visible three times:
when it arrives, the instant the player decides, and for the rest of the trip.

```
Make every challenge visible on the Mission Control screen, in three moments: (A) when it arrives, (B) the instant the player decides, (C) for the rest of the trip. Screen and CSS/SVG only — do not change the physics or the decision rules in src/sim. The engine already exposes everything you need: `pendingEvent`, `decisions[]` (with `hurt`), `powerFactor`, `signalFactor`, `scienceFactor`, `insertionRisk`, `eventFuelKg`, and the log.

General rules
- Add a small "effects" layer to the map: `src/components/MapEffects.tsx` (SVG) and keyframes in styles.css. Keep the map readable; effects are subtle, 1–3 seconds, never block the gauges.
- Add a "mission clock jump": when a decision costs mission time (e.g. "wait a week"), animate the day counter counting forward over ~1.5 s and flash the clock, like a delay board. Read the days from the decision outcome or add a `daysLost` field to the option effects in events.json if it does not exist.
- Every gauge change caused by a decision must animate: the bar slides to the new value over 800 ms and shows a floating "−30% power" or "−5 kg fuel" delta label that fades out. Green for gains, red for losses, amber for "no change but risk taken".
- Persistent marks (moment C): after a decision, keep a small icon on the affected gauge (e.g. a dust icon on Power with "−30% since day 171"; a cracked-signal icon on Signal). Hovering or focusing the icon shows the decision sentence. On the map, a dashed marker on the trail shows where each event happened, with the day number.
- Respect the mute button: sounds only if not muted; every effect must also work with prefers-reduced-motion (then: no shake, no particle animation, instant value change + the delta label only).

Per-event visuals (A = arrival, B = decision, C = lasting)
1. Solar storm
   A: a ring of small particles expands from the Sun toward the spacecraft over ~2 s; the screen gets a faint orange tint; a low rumble sound.
   B: "Switch off" → instruments icon on the Science gauge dims for a moment, small "science −10%" label; "Keep working" → screen shakes 300 ms; if no backup systems, the spacecraft sprite flickers and, when the engine reports failure, goes dark with a short spark burst and the status line turns red; with backup systems, a shield ring flashes around the spacecraft and the log line "Your backup systems protected you" appears in green.
   C: a small storm icon on the trail at that day.
2. Dust on the solar panels
   A: a brown dust haze drifts over the spacecraft; the Power bar visibly dims (semi-transparent overlay) while the card is open.
   B: "Shake panels" → spacecraft wiggles twice, tiny puffs fly off, fuel delta "−5 kg", Power bar returns to full brightness; "Do nothing" → Power bar drops 30% with a slide animation and a dust icon stays on it (C).
3. Course drift
   A: the spacecraft slides a few pixels off the green transfer line and a dotted "predicted path" appears that misses the target; the target planet gets a red outline.
   B: "Correction burn" → a short engine flame at the back of the spacecraft (300 ms), fuel delta "−8 kg", the sprite eases back onto the line and the red outline disappears; "Ignore" → the dotted miss-path stays on the map (C) and the Arrival gauge/status shows "3 in 10 chance of missing" in amber until insertion. At insertion, on a miss, animate the spacecraft flying past the planet and off the map edge.
4. Lost signal
   A: draw a thin line from Earth to the spacecraft; make it break into dashes and flicker; the Signal gauge shows "— no signal —" and its bar pulses grey.
   B: "Switch to large dish" → the line reconnects with a quick pulse traveling Earth→spacecraft; "Wait a week" → mission clock jump (+7 days) and science delta label; "Guesswork" → line reconnects at reduced brightness and stays dimmer (C) with "−20% signal" icon.
5. Instrument fault
   A: one instrument icon on the Science gauge turns red with a small "!" badge.
   B: auto-resolve with backup → the icon turns green with a swap animation and the log line; without backup → the icon stays greyed out (C) and science delta "−20%".

Orbit insertion polish
- Show a 3-2-1 countdown over the map before the braking burn, then the engine flame for 1.2 s and the fuel bar sliding down. On success, a soft ring expands around the target and the spacecraft settles into a small circle around it. On failure, the fly-past animation from event 3.

Results screen tie-in
- In "What happened on the way", reuse the same event icons and, next to each decision, show the delta it caused (e.g. "Power −30%", "Fuel −5 kg", "+7 days"), so the player connects the animation they saw with the number.

Testing and safety
- Add tests that MapEffects renders the right effect for each pendingEvent id and each decision outcome (render to HTML and check for a data-effect attribute).
- Add a "demo" query flag (`?demo=1`) that fires all five events in the first 30 seconds of a Moon mission, so judges and testers can see every effect quickly. Document it in README.
- Keep 60 fps: no more than ~60 SVG elements added by effects at any time; remove finished particles.
- Run npm test and npm run build. Then play Moon with ?demo=1 and confirm every effect appears and clears.
```

**Note for the reviewer (Kunal):** after this stage, open `http://localhost:5173/?demo=1`, start the Moon tutorial and watch all five challenges within the first 30 seconds.

---

## Stage 8 — Fit every screen on a laptop, and give challenges real-world context

Why: measured on a 1366×768 laptop (about 650 px of visible page), the Design Lab is 1761 px tall, Mission Control
991–1124 px, Launch 980 px, Results 1209 px. Mission Control is the worst case: the map is a large square, the six
gauges stack in one column beside it and the log sits below everything, so the player scrolls during a challenge
and cannot see the map, the gauges and the log at the same time. Second, a challenge card only says one line
("A dust storm has coated the solar panels"); it should teach a little and show what the decision will change.

```
Part A — "Cockpit" layout: no scrolling on a laptop.

Target: at a 1366×650 viewport (and anything larger) every screen fits without a vertical scrollbar, except the
results screen which may scroll once. Measure with `document.documentElement.scrollHeight` in a test (jsdom or a
headless run if a browser is available) and add the numbers to STATUS.md. Do not shrink text below 12 px.

1. Mission Control (most important)
   - Use a CSS grid that fills the viewport: `height: calc(100vh - topbar)`, three areas:
     `map` (left, ~55% width), `gauges` (right, ~45%), `log` (bottom strip, full width, 3 lines high, newest on top).
   - The map is NOT a square any more: give it a landscape aspect (about 16:10) and fit the orbit scale to the
     shorter side. Keep the Moon and Sun-centred variants readable.
   - Gauges: a 2-column grid of compact cards (label, value, thin bar, mark icon) — six gauges in three rows, each
     card ≤ 64 px tall. Delta labels and lasting marks from Stage 7 must still fit inside the card.
   - Move the status line ("Cruising to Mars", "Paused: …") into the top bar as a single line with an icon; no
     separate banner row.
   - The challenge card is a centred overlay over the map only (not over the gauges), so the player can see the
     gauges react while the card is open, and the card never pushes content down.
   - The "See results" button appears in the top bar when the mission ends; no extra banner.
   - Add a "Fullscreen" button in the top bar (Fullscreen API) for demos; optional, must not break anything.

2. Design Lab
   - Turn the seven part groups into an accordion: one group open at a time, the others collapsed to a single
     line showing the current choice (e.g. "3. Power — Small solar panels · 40 kg · $8M"). Clicking a header opens
     it and closes the others. Keyboard: Enter/Space toggles, arrow keys move between headers.
   - The four resource bars stay sticky at the top; the Mission check panel stays sticky on the right; the
     Launch button must be visible without scrolling at 1366×650.
   - Fuel slider and "Set to enough + reserve" button live inside the Engine & fuel group.

3. Launch screen
   - Put the calendar (12 columns × 3 rows, each cell ≤ 40 px tall) and the route choice side by side; the
     final-checks list and the Launch button below them, all within one screen. Move "Real missions to compare"
     into a collapsible "Learn more" section, collapsed by default.

4. Results screen
   - Two-column layout: left = score, stars, Flight Director bubble; right = "What happened on the way" and the
     real-mission card. Allowed to scroll once for long decision lists, but the score and the Flight Director
     must be visible without scrolling.

5. Home and Choose mission already fit; only check they still do.

6. Widths under 800 px keep the current stacked mobile layout (scrolling is fine there).

Part B — Challenge context ("metadata").

Extend `src/data/events.json` so every event carries:
- `whatIsIt`: 1–2 plain-English sentences a 12-year-old understands (e.g. "A solar storm is a burst of charged
  particles from the Sun. It can flip bits in a computer or damage electronics.").
- `realExample`: one real mission and year, one sentence (e.g. "In 2018 a planet-wide dust storm covered
  NASA's Opportunity rover's solar panels; it never woke up." / "Mangalyaan made four small course corrections
  on its way to Mars in 2013–14." / "In 2003 a huge solar storm forced Mars Odyssey to switch off an
  instrument for good." / "Deep Space Network dishes lose contact for hours when a spacecraft passes behind the
  Sun." / "Hubble has worked for decades because failed instruments could be swapped or bypassed."). Use only
  facts you are confident are true; mark any you are unsure of with `verify: true` and list them in STATUS.md.
- `howCommon`: short phrase ("Rare — a few times per solar cycle", "Common on Mars in dust-storm season").
- For every option, an `affects` list of the gauges it touches, as plain labels: e.g. ["Fuel −5 kg"],
  ["Power −30% for the rest of the trip"], ["Science −10%"], ["+7 days"], ["3 in 10 chance of missing Mars"],
  ["No cost — backup systems handle it"]. The engine's real effect must match these labels; add a test that
  builds the label from the effect object and compares it to `affects` so they can never drift apart.

Show it in three places:
1. Challenge card: under the one-line explain, a small "What is this?" line (whatIsIt) and a "Real story" line
   (realExample, with the year). Each option button shows its `affects` chips underneath the label in small text
   (green = gain/no cost, red = loss, amber = risk, blue = time). The card must still fit inside the map area at
   1366×650 (max ~420 px tall); if needed, put whatIsIt and realExample behind a "Why does this happen?"
   toggle that opens inline, default closed on small viewports and open on large ones.
2. Mission log: each event line gets an ℹ icon; clicking or focusing it shows the same context in a small popover.
3. Results screen: in "What happened on the way", each decision shows its `affects` chips (reuse the Stage 7
   delta chips) and a one-line realExample under it, so the lesson is repeated once more.

Also add a `howCommon` badge on the card header next to the day number.

Testing and finish
- Tests: every event has whatIsIt, realExample, howCommon and every option has affects (data test); affects
  labels match effects (see above); MissionControl renders the context lines and chips for each event id.
- Run npm test and npm run build. Play Moon with ?demo=1 at a 1366×650 window and confirm: no scrollbar on
  Mission Control, the card sits over the map, and all five cards show context and chips.
- Update README screenshots list if layout changed. Append the STATUS.md entry with the measured page heights.
```

**Note for the reviewer (Kunal):** resize the browser to about 1366×650 (or use DevTools device toolbar) and play the
Moon demo. There should be no vertical scrollbar on Mission Control, and every challenge card should show
"What is this?", a real story with a year, and coloured chips under each option.


---

## Stage 9 — More challenges, and choices that come back to you

**Goal.** Today a mission draws 2–4 challenges from a pool of 5, and every challenge is a punishment. Students
who play twice see the same cards. This stage grows the pool to 15, gives each mission a beginning-middle-end
shape, adds challenges that *reward* a brave choice, and makes one decision cause a later event — so a student
learns that mission design is a chain of consequences, not a list of penalties.

Inspiration: NASA Space Apps 2025 projects — **AstroSweepers** (space-debris tracking with a single risk score
and collision-avoidance manoeuvres), **PureFlow / habitat designer** (a design checked live against real NASA
rules), and **Photonic Force** (sunlight itself as a force on a spacecraft). We are not copying them; we are
borrowing three ideas: *a visible risk number*, *a rule you can break*, and *sunlight as a force*.

Do the four parts in order. After each part: `npm test`, `npm run build`, play one mission, then continue.

```
Read CLAUDE.md first. Then do Stage 9 in four parts, in order. Run npm test and npm run build after each part
and do not start the next part until both pass and the game still plays end to end.

PART 1 — Engine: what a challenge is allowed to do

In src/sim/simulation.ts:

1. Add three effect keys to EventEffect, with tests for each:
   - scienceBonus?: number   // science GAINED, a fraction (0.15 = +15%). scienceFactor *= 1 + scienceBonus.
   - daysSaved?: number      // the clock jumps BACK toward the start: missionDay = max(0, missionDay - daysSaved).
                             // Never below the day the event fired minus its own value, and never below 0.
   - fuelSaved?: number      // kg of fuel given back: eventFuelKg -= fuelSaved, never below 0 spent.
   The outcome sentences follow the existing style: "Science up 15%.", "Saved 12 days.", "Saved 40 kg of fuel."

2. `hurt` in resolveEvent stays as it is (a bonus is never "hurt"). Add a matching `gain` boolean to Decision:
   true when the option produced scienceBonus, daysSaved or fuelSaved and nothing bad happened.

3. Add `kind` to EventDef: "problem" (default) or "opportunity". An opportunity is a chance, not a crisis:
   the card is green, the header says "Opportunity", and the auto-choice when the timer runs out is the safe
   option as usual (never a gamble).

4. Add `phase` to EventDef: "early" | "mid" | "late" | "any" (default "any"). Change scheduleEvents so the
   trip window (settings.eventWindow, 15%–85%) is cut into three equal slices and each chosen event lands in a
   slice its phase allows: early → first slice, mid → second, late → third, any → wherever there is room.
   Keep everything else about scheduling as it is: seeded, no repeats, weighted by `chance`, earliest first,
   and never outside 15%–85% of the trip. The existing scheduling tests must still pass.

5. Raise settings.json eventsPerMission to { "min": 3, "max": 5 }.

6. Add `follows` to EventDef: { "eventId": "...", "optionId": "..." }. An event with `follows` is NEVER drawn
   at the start of a mission. Instead, when resolveEvent applies that exact option of that exact event, the
   follow-up is inserted into `upcoming` at a day between 20% and 60% of the remaining trip, drawn from the
   seeded generator, keeping `upcoming` sorted. If there is no room left before arrival, it is dropped silently.
   A follow-up can itself have protections and options like any other event.

7. Add these flags in designFlags so new events can be gated: the scenario id itself (`"moon"`, `"mars"`,
   `"jupiter"`), `"outerPlanet"` when the target orbit is beyond 1.5 AU, and `"solar"` when the power source
   type is solar. Add a test that lists the flags for one design of each scenario.

8. Add a mission risk number (the AstroSweepers idea, our own version). In SimState add
   `riskTaken: number` — 0 at launch, and every time an option with riskOfFailure or riskAtInsertion is chosen,
   combine it the way insertionRisk already combines: riskTaken = 1 - (1 - riskTaken) * (1 - thatRisk).
   Export a helper `riskLabel(riskTaken)` returning "Low" (< 0.15), "Medium" (< 0.35), "High" (< 0.6),
   "Very high" otherwise. Pure function, tested.

PART 2 — Ten new challenges

Add these to src/data/events.json in the existing shape. Every one needs explain, whatIsIt, realExample,
howCommon, and every option needs `affects` chips that match its effect exactly (the Stage 8 test enforces this).
The real examples below have been checked — use them as written, and do not set verify: true on them.

 1. id "debris" — "Debris warning" — phase "early", chance 0.12, kind problem.
    whatIsIt: Earth is surrounded by old rocket parts and broken satellites. Ground radar tracks the big ones
    and warns a spacecraft when one is coming close.
    realExample: In November 2021 a satellite was blown up in a weapons test and the crew of the International
    Space Station had to shelter in their capsules while the cloud of pieces went past.
    howCommon: Common near Earth — the space station moves out of the way a few times every year.
    Options: (a) "Move out of the way (burns 12 kg of fuel)" safe, fuelCost 12. (b) "Wait one day for better
    tracking (the warning is usually a false alarm)" safe, daysLost 1 + riskOfFailure 0.05. (c) "Hold course",
    riskOfFailure 0.15. protectedBy "large" (a big bus has shielding), protectedText about the shield,
    protectedEffect on (c) riskOfFailure 0.04.

 2. id "micrometeoroid" — "Micrometeoroid strike" — phase "mid", chance 0.08, kind problem.
    whatIsIt: Space is full of grains of dust moving faster than a bullet. One of them can chip a mirror or
    punch a hole in a panel.
    realExample: In May 2022 a dust grain bigger than anyone expected hit the James Webb Space Telescope and
    left permanent damage on one of its mirror segments.
    howCommon: Small hits are constant; a damaging one is rare.
    Options: (a) "Turn the instruments away from the dust stream for a week" safe, sciencePenalty 0.08 +
    daysLost 5. (b) "Keep collecting data", riskOfFailure 0.10 + sciencePenalty 0.05 on survival — model this
    as riskOfFailure 0.10 with sciencePenalty 0.05 in the same effect.
    protectedBy "threeInstruments" (a spare instrument covers the damage), autoResolveWhenProtected false.

 3. id "sunPush" — "Sunlight is pushing the spacecraft" — phase "mid", chance 0.10, onlyIf "solar", kind problem.
    whatIsIt: Light itself has a tiny push. Over months, sunlight falling on big solar panels slowly turns a
    spacecraft and nudges it off course.
    realExample: After two of its steering wheels broke, NASA's Kepler telescope was balanced against the push
    of sunlight on its solar panels, and in 2014 it started a whole second mission that way.
    howCommon: Always happening — every mission has to allow for it.
    Options: (a) "Tilt the panels to balance the push (power drops 10%)" safe, powerPenalty 0.10.
    (b) "Correct with the thrusters (burns 6 kg of fuel)" safe, fuelCost 6.
    (c) "Let it drift", riskAtInsertion 0.2.
    failText: The push of sunlight had turned the spacecraft just enough to miss {target}.

 4. id "planetaryProtection" — "Planetary protection rule" — phase "late", chance 0.07, onlyIf "mars",
    kind problem.
    whatIsIt: Mission rules say a spacecraft must not carry Earth germs to a world where life might exist.
    If the path could hit the planet, it has to be changed.
    realExample: In 2017 NASA deliberately flew Cassini into Saturn to burn it up, so it could never crash into
    Enceladus, a moon with an ocean under its ice.
    howCommon: Every mission to Mars or an icy moon has to follow this rule.
    Options: (a) "Raise the flyby path (burns 10 kg of fuel)" safe, fuelCost 10.
    (b) "Point the instruments away and keep the path" safe, sciencePenalty 0.15.
    (c) "Ignore the rule", riskAtInsertion 0.25.
    failText: Mission control took control of the spacecraft and pushed it away from {target}.

 5. id "gravityAssist" — "Free push from a planet" — phase "early", chance 0.12, onlyIf "outerPlanet",
    kind OPPORTUNITY.
    whatIsIt: Flying close past a planet steals a little of the planet's speed and gives it to the spacecraft.
    It is free fuel, but the aim has to be near perfect and the longer path costs time.
    realExample: Cassini flew past Venus twice, then Earth, then Jupiter, before it finally reached Saturn
    in 2004 — the free pushes saved fuel no rocket could have carried.
    howCommon: Used by almost every mission to the outer planets.
    Options: (a) "Take the flyby" fuelSaved 60 + daysLost 30 + riskAtInsertion 0.1, affects chips must show all
    three. (b) "Stay on the direct path" safe, effect none.
    failText: The flyby aim was off and the spacecraft never reached {target}.

 6. id "bonusTarget" — "An asteroid is passing close" — phase "mid", chance 0.12, kind OPPORTUNITY,
    onlyIf "hasInstruments".
    whatIsIt: Sometimes a small world happens to sit near the flight path. Turning to look at it is extra
    science the mission never planned for.
    realExample: On its way to a comet, Europe's Rosetta spacecraft turned aside to photograph the asteroids
    Šteins in 2008 and Lutetia in 2010.
    howCommon: A lucky extra — a few missions get the chance.
    Options: (a) "Turn and photograph it (burns 4 kg of fuel, costs 3 days)" scienceBonus 0.15 + fuelCost 4 +
    daysLost 3. (b) "Stay on plan" safe, effect none.

 7. id "safeMode" — "The spacecraft switched itself off" — phase "any", chance 0.10, kind problem.
    whatIsIt: When a spacecraft notices something wrong, it shuts down everything except the radio and waits
    for instructions. Engineers call this safe mode.
    realExample: In October 2016 NASA's Juno spacecraft put itself into safe mode just before a close pass of
    Jupiter, and the science from that pass was lost.
    howCommon: Occasional — most long missions do it at least once.
    Options: (a) "Run the full check-out before waking it (costs 10 days)" safe, daysLost 10 +
    sciencePenalty 0.05. (b) "Restart it immediately", riskOfFailure 0.12.
    protectedBy "backup", protectedEffect on (b) riskOfFailure 0.03.

 8. id "groundStationBusy" — "No dish free on Earth" — phase "any", chance 0.09, kind problem.
    whatIsIt: Only a handful of giant dishes on Earth can hear a spacecraft in deep space, and every mission
    has to share them.
    realExample: Only one dish on Earth can send commands to Voyager 2 — a 70-metre antenna near Canberra —
    and when it went offline for repairs for eleven months in 2020 the spacecraft could not be told anything.
    howCommon: Constant — dish time is booked months ahead.
    Options: (a) "Wait your turn (costs 6 days)" safe, daysLost 6.
    (b) "Send the data slowly on the small dish" safe, sciencePenalty 0.12.
    (c) "Store everything on board and send it later", riskOfFailure 0.08, failText about a full memory
    crashing the computer.
    protectedBy "antLarge", protectedEffect on (b) sciencePenalty 0.04.

 9. id "softwareBug" — "A bug in the flight software" — phase "mid", chance 0.09, kind problem.
    whatIsIt: A spacecraft is run by a computer, and its program can have mistakes that only show up in space.
    Engineers can send a new program across millions of kilometres to fix it.
    realExample: Days after landing on Mars in 1997, NASA's Pathfinder kept resetting itself, until engineers
    on Earth found the bug and sent up new software that fixed it.
    howCommon: Common — almost every mission updates its software in flight.
    Options: (a) "Upload the fix and test it carefully (costs 8 days)" safe, daysLost 8.
    (b) "Patch it live", riskOfFailure 0.10.
    (c) "Work around it" safe, sciencePenalty 0.10.

10. id "radiationBelt" — "Jupiter's radiation" — phase "late", chance 0.14, onlyIf "jupiter", kind problem.
    whatIsIt: Jupiter is wrapped in belts of charged particles trapped by its magnetic field. They are strong
    enough to destroy ordinary electronics in weeks.
    realExample: NASA's Juno carries its computer inside a titanium vault about a centimetre thick, built only
    to keep Jupiter's radiation out.
    howCommon: Certain at Jupiter — the question is only how much.
    Options: (a) "Shorten the time in the belts (burns 15 kg of fuel)" safe, fuelCost 15.
    (b) "Shield the computer by shutting instruments down" safe, sciencePenalty 0.18.
    (c) "Fly straight through", riskOfFailure 0.20.
    protectedBy "large", protectedEffect on (c) riskOfFailure 0.06.

Three follow-ups (each has `follows`, so it is never drawn on its own):

11. id "debrisDamage" — "Damage found" — follows { eventId "debris", optionId "hold" } (use the real option id
    you gave "Hold course"). A piece hit a panel after all.
    realExample: Small strikes are usually only found later, when engineers see that a panel is making less
    power than it should.
    Options: (a) "Work with less power" safe, powerPenalty 0.15. (b) "Spin the spacecraft to face the Sun
    better (burns 5 kg of fuel)" safe, fuelCost 5.

12. id "assistCheck" — "Aim check after the flyby" — follows the "take the flyby" option of "gravityAssist".
    realExample: After every gravity assist, mission control tracks the spacecraft for weeks to measure exactly
    what the planet did to its path.
    Options: (a) "Clean-up burn (burns 7 kg of fuel)" safe, fuelCost 7, and it REMOVES the flyby's
    riskAtInsertion — add an effect key `clearInsertionRisk?: boolean` in Part 1 that sets insertionRisk back
    to 0 and clears insertionRiskText. (b) "The aim looks close enough" effect none — the risk stays.

13. id "extraData" — "The new instrument is working well" — follows the "turn and photograph it" option of
    "bonusTarget", kind OPPORTUNITY.
    realExample: Data taken on the way to a target has often turned into science papers of its own.
    Options: (a) "Send it all home (costs 4 days)" scienceBonus 0.1 + daysLost 4. (b) "Keep to the schedule"
    safe, effect none.

Balance rule: a mission must still be winnable. After adding these, re-run the balance sweep from
BALANCE_NOTES.md (200 seeded runs per reference design, Moon / Mars tight / Jupiter) and tune `chance` values
only — never the physics — so the Moon reference design still succeeds in at least 90% of runs and the tight
Mars design in at least 70%. Write the new numbers into BALANCE_NOTES.md.

PART 3 — Showing it

1. Opportunity cards are visually different: green border and a "★ Opportunity" badge instead of the red
   "Challenge" header, and the countdown ring is green. Same layout, same size limit as Stage 8 (fits in the
   map area at 1366×650).
2. Add a "Mission risk" readout to the Mission Control top bar: the riskLabel() word with a small coloured dot
   (green / amber / orange / red). It updates the moment a risky option is chosen, with the same brief
   highlight animation Stage 7 uses for the gauges. A tooltip explains: "Every risky choice adds to this. It is
   the chance something goes wrong before you arrive."
3. A follow-up event's card says where it came from, in one line at the top: "This is because of your choice on
   day 62." Use the stored decision to fill in the day.
4. Results screen: in "What happened on the way", opportunities taken show a green chip and a "+" delta;
   the Flight Director lines already handle best/riskiest — extend decisionLines() so that when the player took
   an opportunity it says so ("You took the chance on day 96 and it paid off: …"), and when a follow-up event
   happened it names the cause ("The debris damage on day 110 came from holding course on day 41."). Keep the
   existing safe-choice wording exactly as it is.
5. Glossary: add short entries for space debris, gravity assist, safe mode, planetary protection, solar
   radiation pressure and Deep Space Network, in the same plain style as the existing entries.

PART 4 — Tests and finish

- Data tests, extending the Stage 8 ones to the whole pool: every event has explain, whatIsIt, realExample,
  howCommon; every option has `affects` chips that match its effect object exactly, including the three new
  keys; every `follows` points at an event id and option id that really exist; every `onlyIf` and `protectedBy`
  names a flag designFlags can actually produce.
- Engine tests: scienceBonus raises science; daysSaved never takes the clock below 0; fuelSaved never makes
  eventFuelKg negative; phase placement puts an "early" event in the first slice and a "late" event in the last;
  a follow-up appears in `upcoming` only after its trigger option is chosen, and never when another option is
  chosen; a follow-up too close to arrival is dropped without crashing; riskLabel boundaries; clearInsertionRisk
  sets insertionRisk to 0.
- Replay test: the same seed and the same choices still give exactly the same mission, follow-ups included.
- Play test: run all three scenarios with ?demo=1 and confirm 3–5 challenges appear, an opportunity card looks
  green, and the risk readout changes when a risky option is taken.
- npm test and npm run build must pass. Append the STATUS.md entry: how many events are in the pool now, the
  new balance numbers, and anything you had to change in the engine that this prompt did not anticipate.
```

**Note for the reviewer (Kunal):** play Jupiter twice with different seeds. Two runs should now feel like two
different missions. Watch for the gravity-assist card early on — that is the one that teaches the real lesson
(spend time to save fuel), and the aim-check that follows it is the one that teaches consequences.

**On the inspiration links:** I could read the AstroSweepers site and the PureFlow habitat designer in full.
The two spaceappschallenge.org project pages and the YouTube video block automated reading, so the Photonic
Force idea above is taken from the project's name and theme (photon pressure as a real force), not from its
page. If you save those two pages as PDFs into the NASA folder, I can read them properly and add more.

---

## Stage 10 — Make the UI teach (ideas adopted from PureFlow, Space Apps 2025)

**Goal.** Right now the screens *report* numbers. After this stage they *explain* them. Five changes, each one
taken from a pattern I saw working in the PureFlow / NASA Mission Designer project, and each one reusing a
component this repo already has. No new libraries. Stage 8's rule still holds: nothing may add a scrollbar at
1366×650.

Do the five parts in order. After each part: `npm test`, `npm run build`, play one mission, then continue.

```
Read CLAUDE.md first. Then do Stage 10 in five parts, in order. Run npm test and npm run build after each part
and do not start the next part until both pass and the game still plays end to end at 1366x650 with no scrollbar.

PART 1 — Every part card shows what it DOES, not just what it weighs

Today a Design Lab card reads "Camera — 20 kg · 30 W · $10M · 10 science pts". Those are specs. A 12-year-old
cannot tell whether 30 W is a lot. Add a SECOND line to each card that says what choosing it does to THIS
mission, in plain English.

The `Choices` component in src/screens/DesignLab.tsx already takes a `detail: (p) => string`. Add an optional
second prop `effect?: (p: T) => string` rendered under `detail` in a new class `.effect` (slightly brighter than
`.muted`, never red). Every string must be COMPUTED from the existing functions in src/physics/ against the
current scenario and the current design — never hard-coded, never put in JSON. It must update live as the
player changes anything else, exactly like the four resource bars do.

What each group's effect line says:
- Rockets:      "Can lift 3000 kg into space"  (the mass limit)
- Bodies:       "Room for 3 instruments" plus, for the large bus, "Has backup systems: protects you from a
                solar storm"  (the `backup` flag is what events.json calls `protectedBy: "backup"`)
- Instruments:  "Adds 30 science points, needs 120 W"
- Power:        solar → "Makes about 110 W at Mars"  (use powerMade() with the scenario distance, so Jupiter
                really does show the small number); RTG → "Makes 300 W anywhere. Sunlight does not matter."
- Antennas:     "About 10% of your science reaches Earth"  (the comms fraction for this scenario)
- Engines:      "Needs about 1800 kg of fuel for this trip"  (fuelBurned() for the scenario deltaV at the
                current dry mass), and for ion additionally "and 1000 W of power the whole way"
                DO NOT write a travel time on the engine card. In this game trip time comes from the scenario
                and the route, not from the engine, and a card that claimed otherwise would be a lie.

When a choice would break a check, the effect line is still the plain fact ("Can lift 1500 kg into space") —
the Mission check panel stays the only place that says ⚠. Do not turn these into warnings.

Tests: one per group, asserting the effect string changes between Moon and Jupiter where the physics says it
should (power at the target, comms fraction, fuel needed) and that no string is hard-coded.

PART 2 — Say where the numbers come from, on screen

GDD Section 17 labels every number in this game Real formula / Real number (rounded) / Game value. None of it
is visible in the UI. A judge will never open the Word document.

1. Add src/data/provenance.json: a list of rows { what, kind, detail }, kind being "formula" | "real" | "game".
   At minimum: rocket equation (formula, "Tsiolkovsky: dv = Isp x g0 x ln(m0/mf), g0 = 9.80665"), sunlight
   (formula, "inverse square: Mars gets 43% of Earth's sunlight, Jupiter 3.7%"), signal delay (formula, "light
   takes 8.317 minutes per AU"), launch windows (real, "Mars every 26 months, Jupiter about every 13"), trip
   times (real, "rounded from real mission durations"), part masses and costs (game), budgets (game), event
   chances (game), science points (game).
2. Add a one-line footnote under the Mission check panel in the Design Lab and under the final checks on the
   Launch screen: "Fuel, power, signal and launch windows come from real formulas. Costs and points are game
   values." followed by a link-styled button "Where the numbers come from".
3. That button opens a modal listing provenance.json grouped by kind, with a coloured tag per row
   (blue = formula, green = real, grey = game). Build it by copying the GlossaryPanel pattern in
   src/components/Glossary.tsx — it already has the focus trap, Escape-to-close and click-outside behaviour.
   Name it ProvenancePanel. Do not write a second focus trap; extract the shared bits if that is cleaner.
4. Put the same footnote line at the bottom of the Results screen.

Tests: every row in provenance.json has a valid kind; the panel renders all three groups; Escape closes it;
focus returns to the button that opened it.

PART 3 — Difficulty you can see on the mission cards

src/screens/ChooseMission.tsx shows three bullet points and a text tag saying "Hard". Replace the bullets with
three chips per mission, using the SAME chip component and CSS you built for event `affects` in Stage 8.

Each mission gets exactly three chips, computed from scenarios.json, never typed out by hand:
- Sunlight at the target   — "Sunlight: 100%" / "43%" / "3.7%"      (inverse square from distanceAU)
- Signal delay one way     — "Signal: 1.3 seconds" / "13 minutes" / "43 minutes"
                             (Moon is an Earth-centred trip: use the real Earth-Moon light time, about 1.3 s,
                             not 8.317 min/AU, which would be wrong)
- Launch window            — "Launch: any month" / "every 26 months" / "every 13 months"

Colour by how hard it makes the mission: green for the easy end, amber in the middle, red for the hard end.
Keep "Budget" and "Trip" as plain text above the chips — those are still the first things a player needs.

Tests: each scenario renders exactly three chips; Moon's signal chip is in seconds and Jupiter's in minutes;
the chip colours follow the value, not the scenario id.

PART 4 — A one-line summary of the ship that follows the player

Once the player leaves the Design Lab, the spacecraft they built becomes invisible. When a challenge costs 8 kg
of fuel they cannot see what it is coming out of.

Add a `MissionSummary` component: one line, one row, no wrapping —
  "Mars · Chemical engine · 2 instruments · Large dish · Fuel 1800 kg · dv 5.7 km/s"
with an "Edit" button on the right that goes back to the Design Lab (hidden once the mission has launched).
Show it in the top bar of the Launch screen, and in the `topbar cockpit-bar` of Mission Control under the
"Day 142 of 240 · 1 sec = 4 days" line. It must add no more than 28 px of height; below 900 px wide it drops to
just the target and the engine.

On Mission Control the fuel figure is the LIVE figure from the simulation, and it gets the same brief highlight
animation as the gauges when a challenge changes it (Stage 7 behaviour). Everything else on the line is fixed
at launch.

Tests: the line renders every part of the design; Edit is absent once phase is not "cruise"; the fuel number
follows sim.fuelKg.

PART 5 — A four-step timeline instead of hunting the log

Milestones are currently buried in the scrolling mission log between challenge lines. Add a compact horizontal
strip under the mission clock with four steps:

  Launch ──── Cruise ──── Arrival burn ──── In orbit

Drive it from the simulation state, not from new data: "Launch" is done once missionDay > 0, "Cruise" is the
current step while phase is "cruise", "Arrival burn" lights up at phase "insertion", "In orbit" ticks green at
phase "orbit" and turns red with the word "Lost" at phase "failed". Completed steps get a ✔, the current one
pulses gently, future ones are grey. Maximum height 36 px. The existing MILESTONES array stays as it is — it
still writes the log lines; this strip is a second, visual read of the same thing.

Tests: the strip shows the right current step for each phase, including "failed"; it never shows two current
steps at once.

FINISH
- npm test and npm run build must pass.
- Play all three scenarios at 1366x650. Confirm: no scrollbar anywhere, the Design Lab effect lines change when
  you switch scenario, the provenance panel opens and closes with the keyboard, the summary line fits on one
  row, and the timeline strip reaches "In orbit".
- Re-shoot docs/screenshots/ (Stage 6 list) since the layout changed.
- Append the STATUS.md entry with the measured page heights and anything this prompt did not anticipate.
```

**Note for the reviewer (Kunal):** the part to judge is Part 1. Open the Design Lab on Moon, then on Jupiter,
and watch the power and antenna lines change. If those two lines don't make a 12-year-old say "oh, that's why
Jupiter needs the big panels", Part 1 hasn't done its job yet.

---

## Stage 11 — Make it look like space, and let the player fall into it

**Goal.** Today the flight map is a flat dark panel with dashed circles in a bordered box. It reads as a
diagram. It should read as *space* — and then the player should be able to open it up, fill the screen with it,
and watch their spacecraft crawl across a real sky with the instruments floating over the top.

Two rules hold the whole stage together:

- **Scenery is dim, the mission is bright.** Stars, the Milky Way and distant galaxies are decoration and must
  never compete with the Sun, Earth, the target, the orbits, the transfer path or the spacecraft. A player
  should never wonder whether a dot matters.
- **The pretty version shows MORE truth, not less.** Opening the space view adds real, checkable information
  (scale, distance, light-time), so it is not just eye candy. That is the whole thesis of this game.

Do the five parts in order. After each: `npm test`, `npm run build`, play one mission, then continue.

```
Read CLAUDE.md first. Then do Stage 11 in five parts, in order. Run npm test and npm run build after each part,
and do not start the next until both pass and the game still plays end to end. No new libraries: plain SVG and
CSS, same as the rest of the project.

PART 1 — The sky

New component src/components/Starfield.tsx, drawn as an SVG <g> INSIDE the existing map <svg> so it scales with
the map and the space view is a true zoom of the same picture, not a second drawing.

Layers, back to front:
  1. Deep space wash: one or two very large, very low-opacity radial gradients (a cool blue and a faint violet)
     so the black is not flat. SVG <radialGradient>, no filters.
  2. The Milky Way: a broad diagonal band of denser, smaller stars plus a soft low-opacity gradient along the
     band. It must read as a band, not a stripe — feather the edges.
  3. Distant galaxies and nebulae: 2 or 3 only, small, faint, off to the edges. A galaxy is a tiny tilted
     ellipse with a brighter core; a nebula is a soft blurred blob. Never near the Sun or the flight path.
  4. Stars: about 260 of them, sizes 0.4 to 1.6 px in map units, opacity 0.25 to 0.9, a few with the faintest
     blue or amber tint. Denser inside the Milky Way band.

Rules for this component:
- EVERY position, size and opacity comes from the seeded generator `nextRandom` already in src/sim/simulation.ts,
  from a fixed seed. The sky must be identical on every run and in every screenshot, so it can be tested and so
  it never flickers on re-render.
- The whole layer is computed ONCE. Wrap it in React.memo and useMemo keyed on the viewBox only. It must not
  re-render when the mission clock ticks — the spacecraft moves 60 times a second and the stars must not be
  touched. Confirm this with a render-count test.
- The stars DO NOT MOVE as the spacecraft travels, and that is not laziness — it is correct. The stars are so
  far away that crossing the solar system does not shift them. Say exactly that in a comment, and add it to the
  glossary as "Why don't the stars move?".
- aria-hidden="true" on the whole layer; it is decoration and must not reach a screen reader.
- All the tunable numbers (star count, band angle and width, galaxy count, opacity ranges, seed) go in a new
  src/data/sky.json. No magic numbers in the component.
- Twinkle: OFF by default. If you add it, it is a CSS opacity animation on at most 20 stars, disabled under
  prefers-reduced-motion, and it must not cost measurable frame time.

PART 2 — Scenery behind, mission in front

The mission objects must win every time. Apply these to the existing FlightMap drawing:
- Sun: warm core plus a soft corona, clearly the brightest thing on screen.
- Earth and the target: solid, saturated, each with a thin bright rim so they read as bodies, not dots. Keep the
  colours already in scenarios.json.
- Orbits: brighter than now and clearly drawn, still dashed. The transfer path (the trail) is the brightest
  line on screen.
- The spacecraft: keep the sprite, add a small bright halo so it never disappears against a star.
- Labels: every label gets a dark translucent pill behind it, so no label ever sits unreadable on top of a star.
- Stars are capped at opacity 0.9 and the Milky Way band at 0.20, so nothing decorative can approach the
  brightness of a mission object.
Add a test that reads the rendered SVG and asserts the mission objects carry their own classes and that no
decorative element uses a mission class.

PART 3 — Space view

Replace the current "⛶ Fullscreen" button with a single button labelled "⛶ Space view" (and "Exit space view"
when active). One button, not two — this is for twelve-year-olds. Pressing it:
  1. switches Mission Control into the immersive layout described below, AND
  2. requests browser fullscreen on the app root (if the browser refuses or does not support it, the immersive
     layout still works — never let a failed fullscreen request break the mode).
Escape exits both. Exiting browser fullscreen by any other means also exits the immersive layout, so the two
never disagree.

The immersive layout:
- The map fills the whole viewport, edge to edge. No panel border, no card, no padding, no rounded corners.
- The gauges (fuel, power, signal, science collected) become a floating HUD: a single row along the BOTTOM,
  translucent, over the space.
- The mission log becomes a floating panel in the TOP RIGHT, translucent, showing the most recent 5 lines,
  newest at the bottom, scrollable if the player wants more.
- The clock, the scale, the mission risk readout, the speed buttons and the ship summary line stay in a
  translucent strip along the TOP LEFT.
- Every floating panel: background rgba of the panel colour at about 0.55, backdrop-filter: blur(8px), a 1px
  border at low opacity, and a text colour that stays at WCAG AA against the brightest sky underneath. Test
  this by placing a panel over the Milky Way band and checking contrast — if it fails, raise the scrim, do not
  lower the star opacity. Provide a plain rgba fallback for browsers without backdrop-filter.
- The HUD never covers the Sun, the target, or the spacecraft's current position. If the spacecraft would pass
  under a panel, fade that panel to 0.25 opacity while it does, and back afterwards.
- CHALLENGE CARDS STILL WORK. A challenge in space view still appears, still auto-pauses the clock, still shows
  its options, context and chips, centred over the map. This is the mode a judge will demo in, so a card that
  fails to appear here is a broken game. Test it explicitly.
- The normal (non-immersive) Mission Control keeps its current layout and must still fit 1366x650 with no
  scrollbar. The starfield appears in BOTH views — the same sky, just smaller — so entering space view feels
  like leaning closer, not like arriving somewhere else.

PART 4 — Earn the space: show more that is true

Because the view is now big, add the real information there is finally room for. All computed, none typed:
- A scale bar in a bottom corner: a line labelled with its length in AU and in million km, sized from the map's
  own AU-to-pixel factor so it is always honest.
- Live "Distance from Earth" and "Signal delay one way" in the HUD, already in the sim state.
- The target's orbit and Earth's orbit drawn to true relative scale (they already are) with a one-line note
  that says so.
- The transfer ellipse drawn for the WHOLE trip, not just the part already flown: the flown part bright, the
  part still to come faint and dashed. A player should see where they are going.
- One line in the HUD: "Orbits and distances to scale. The stars are decoration." with the existing "Where the
  numbers come from" button beside it. Do not let a pretty sky quietly undo the honesty the game is built on.

PART 5 — Tests, performance and finish

- Deterministic sky: two renders with the same seed produce identical SVG; changing the seed in sky.json
  changes it.
- Starfield does not re-render when the mission clock advances (render-count test).
- Space view: entering adds the immersive class and requests fullscreen; Escape exits both; a failed fullscreen
  request still enters the immersive layout; a challenge card renders and auto-pauses in space view.
- Contrast: the HUD text colour against the panel-over-Milky-Way background passes WCAG AA (4.5:1). Compute it
  in the test, do not eyeball it.
- Performance: measure with the existing scripts/measure.mjs — the cruise must hold 60 fps on a Moon mission at
  4x in a 1366x650 window, and the SVG must stay under 600 total elements. If stars push it over, cut the count
  in sky.json rather than the quality of anything else.
- prefers-reduced-motion: no twinkle, no parallax, everything else still works.
- Re-shoot screenshots/ via npm run measure, and add one of the space view with a challenge card open.
- Append the STATUS.md entry: element count, measured frame rate, the contrast ratio you computed, and anything
  this prompt did not anticipate.
```

**Note for the reviewer (Kunal):** the test is whether a twelve-year-old presses "Space view" and then does not
want to press anything else for thirty seconds. If the sky is so busy that you have to hunt for your own
spacecraft, Part 2 has failed and the star opacity needs to come down — not the mission objects up.

---

## Stage 12 — The challenge happens to YOUR spacecraft

**Goal.** Today a challenge is a card with a list of radio buttons. It could be about anybody's spacecraft.
After this stage the player sees the machine they built, watches the thing go wrong on the part it goes wrong
on, and acts on that part.

Two rules:

- **You are Mission Control on Earth, not aboard.** These are uncrewed orbiters — Mangalyaan, Juno,
  Chandrayaan. Nobody is inside. The immersion comes from the spacecraft being visibly *yours*, not from
  pretending a person is on it.
- **The diagram is an enhancement, never the only way.** Every option stays a real, focusable, labelled
  `<button>`. A player using a keyboard or a screen reader must be able to play the whole game. If the
  schematic and the buttons ever disagree, the buttons win.

Parts 1 to 3 are the stage. Parts 4 and 5 are polish — **do them only after the game is deployed and the
submission pack is done.**

```
Read CLAUDE.md first. Then do Stage 12 one part at a time. Run npm test, npm run build and npm run measure
after each part, and do not start the next until all three pass and the game still plays end to end.
No new libraries: SVG and CSS, as the rest of the project.

PART 1 — Your spacecraft is the one you built

New component src/components/Spacecraft.tsx exporting two things, both pure SVG built from the Design:
  - <ShipSprite design={...} heading={...} />  the small sprite on the map, replacing today's white triangle
  - <ShipSchematic design={...} highlight={partId|null} />  a larger front-on cutaway for the challenge panel

Both are assembled from the player's actual choices, never a fixed picture:
  - body: small / medium / large bus, visibly different sizes
  - power: two small panels, two LARGE panels (clearly bigger), or a stubby RTG canister with fins
  - antenna: a small dish or a visibly larger dish
  - instruments: one small sensor box per instrument the player bought, up to three
  - engine: a compact chemical nozzle, or an ion thruster with a longer grid
Every part carries data-part="<partId>" so the schematic can highlight one and tests can find it.
Keep the sprite under 28px on the map at 1366x650 and keep the whole thing under 40 SVG elements.

Add a test per part group asserting a large bus renders bigger than a small one, large panels bigger than
small, the RTG has no panels, and three instruments render three sensor boxes.

PART 2 — The challenge happens ON the spacecraft

Rebuild the challenge card around the schematic. Layout, inside the same size budget as today's card:
  - Left: <ShipSchematic> with the affected part highlighted and visibly damaged — panels greyed and dulled
    for dust, a dented panel for a micrometeoroid, a dark instrument for an instrument fault, a dish turned
    away for lost signal. One visual state per event.
  - Right: the event name, the one-line explain, the "Why does this happen?" toggle with whatIsIt and
    realExample, and the option buttons exactly as they are today with their affects chips.
Add "affectsPart" to each event in src/data/events.json naming which part it hits ("power", "antenna",
"instruments", "body", "engine", or null for whole-mission events like a debris warning). A data test
requires every event to have it and requires the value to be a part the schematic can actually draw.
Hovering or focusing an option button highlights, on the schematic, the part that option changes.

Accessibility is not optional here: the schematic is aria-hidden, every option stays a real button with its
full text label, and the card is still fully playable with Tab and Enter alone. Add a test that plays a
challenge start to finish using only keyboard events.

PART 3 — Short cutscene beats

When a challenge arrives, play a two-second SVG beat over the map BEFORE the card opens: dust rolling across
the panels, a rock tumbling past, the dish swinging, the Sun flaring. One beat per event id, from a small
map in code, with a sensible default for any event that has none.
Rules: it never blocks input (Escape or any click skips straight to the card), it never delays the auto-pause,
it is skipped entirely under prefers-reduced-motion, and a "Skip animations" toggle in settings turns it off
for good. Test that the card still opens if the beat is skipped, and that the mission clock is paused for the
same total time either way.

STOP HERE. Commit, deploy, and finish the submission pack before doing Parts 4 and 5.

PART 4 — Lit spheres with real phases

Draw each body as a sphere lit from the Sun's actual position, which the sim already knows:
a radial gradient offset toward the Sun, a terminator, a thin bright rim on the sunlit edge. The phase must be
computed from the real angle between the Sun, the body and the spacecraft — so an approaching player sees Mars
as a crescent and then full. Add a glossary entry explaining phases, and a test pinning the phase at three
known angles. The Sun itself stays a light source, not a lit body.

PART 5 — Character and plumes

Per-body detail, still SVG: Jupiter gets horizontal bands and the Great Red Spot, Mars a polar cap and a rust
haze, Earth a blue marble with a bright atmospheric rim, the Moon a few darker craters. Then the engine plume
during a burn, coloured by engine type — a short bright orange flare for chemical, a long faint blue glow for
ion — so the difference between the two engines is something the player sees, not just reads.
Keep the SVG element budget under 600 and 60 fps at 4x, both already measured by npm run measure.
```

**Note for the reviewer (Kunal):** the test for Part 1 is to build a cheap little probe, then a fat one with
large panels and three instruments, and look at the map. If the two spacecraft look the same, Part 1 has not
landed, whatever the tests say.
