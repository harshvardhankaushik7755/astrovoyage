# Status log

One entry per stage or fix, newest at the bottom. Format from CLAUDE.md.

## 2026-09-21 — Stage 0: Orientation
- Read everything; confirmed `npm test` (12 tests) and `npm run build` passed. No files changed.
- Found and reported: Jupiter could not be won with any instrument (comms check), the ion engine could not be
  powered at Mars or Jupiter, and several small smells (hard-coded ion trip factor, calendar constants in a screen).
- Fixed the Windows setup: `node_modules` had Unix symlinks instead of `.cmd` shims, so `npm run dev` could not start.

## 2026-09-21 — Stage 1: Simulation engine
- Built `src/sim/simulation.ts` (Hohmann-style path with Kepler timing, fuel burn, power and signal along the
  way, milestones, orbit insertion that can fail, time scale) and `src/sim/__tests__/simulation.test.ts`.
- Data added: `targetOrbitDays`, `targetOrbitRadiusAU`, `insertionDeltaV`, `centralBody` per scenario;
  `burnProfile` per engine. `runChecks` now also returns `dryMassKg` and the exact Δv numbers.
- Decisions: signal strength is pure inverse-square (the comms factor would have made Jupiter read 0%);
  the scenario Δv is split into cruise + insertion so a design that passes the fuel check reaches orbit;
  the clock snaps to honest labels ("1 sec = 4 days"), so missions run 62–90 real seconds.
- Tests 40, build passed.

## 2026-09-21 — Stage 2: Mission Control screen
- Built `src/screens/MissionControl.tsx` (SVG map, six gauges, clock with Pause/1x/4x, log, insertion burn),
  `src/components/Gauge.tsx`, store actions `startMission` and `tick`, a "Load a design that works" preset button.
- Simplified: no browser was available, so the play-through was done numerically (65 s Moon, 68 s Mars,
  89 s Jupiter at 1x) and the screen is tested by rendering it to HTML.
- Decision: the insertion burn is held on screen for 1.2 s before the engine settles it.
- Tests 49, build passed.

## 2026-09-21 — Stage 3: Challenges
- Built seeded scheduling (2–4 events per mission), `resolveEvent`, `safestOption`, the challenge card with a
  20-second countdown, `decisions` in the sim state, and `src/data/events.json` with five events and options.
- Decisions: course drift resolves at arrival (`riskAtInsertion`); options that would make the braking burn
  impossible carry a warning and mission control never picks them; timing numbers moved to `settings.json`.
- Open question (balance, deferred to Stage 5): no Mars design within budget could afford the 30 kg
  correction burn, so about one Mars mission in five was lost to the drift gamble.
- Tests 73, build passed.

## 2026-09-21 — Stage 4: Results, scoring and the AI Flight Director
- Built `src/sim/score.ts`, `src/ai/flightDirector.ts` (report builder, rule-based explanations for twelve
  outcomes, comparison lines, AI fetch with a 6 s timeout), the new `Result.tsx`, and `server/index.mjs`
  (Claude through the Anthropic SDK, OpenAI through the OpenAI SDK, chosen by environment variables).
- Decisions: default Claude model `claude-opus-5` at low effort with the server-side refusal fallback on;
  OpenAI default `gpt-4.1-mini`; scoring success fraction is 1 in orbit, 0 otherwise.
- Not verified: a real AI reply (the only key on this machine, an OpenAI key, has no credits). The request
  shapes are tested with fake clients and the HTTP server against a live local port.
- Tests 100, build passed.

## 2026-09-21 — Stage 5: Polish, balance and accessibility
- Built: glossary dialog (`src/components/Glossary.tsx`, `src/data/glossary.json` from the GDD word list), Home
  "How to play" strip and tutorial button, mute button and Web Audio sounds (`src/sound/sound.ts`), focus rings,
  radio-group names and arrow-key calendar, text marks beside every colour signal, phone and tablet styles,
  `routeDescription` in words, a test that fails on any React console warning, `BALANCE_NOTES.md`, this file.
- Balance (JSON only): large panels 2800 W, light rocket 2200 kg, fuel-button reserve 15%, Jupiter comms 0.05,
  correction burn 8 kg, dust shake 5 kg, reboot 1 kg, Mars preset 1800 kg, Jupiter preset with instruments.
- Skipped: the GitHub Pages deploy step, on Kunal's instruction. No browser was available, so widths and
  keyboard flows were reviewed from the code by five reviewers plus adversarial verification, not clicked through.
- Decisions: Jupiter comms stays honest at 0.05 and the Flight Director no longer blames the big dish for the
  distance; event fuel costs follow real correction budgets rather than the original 20 and 30 kg.
- Tests 111 in 10 files, `npm run build` passed.
- Open questions for Kunal: is a 15% fuel reserve on the button acceptable, or should the label explain it more?
  Should the ion engine draw 400 W (Hayabusa-class) instead of 1000 W? Both are one-number JSON changes.

## 2026-09-22 — Stage 7: Show cause and effect (challenge visuals)
- Stage 6 (submission pack) has not been done yet; Kunal asked for Stage 7 first.
- Built: `src/components/MapEffects.tsx` (spacecraft sprite plus every effect, each with a data-effect attribute),
  `src/components/Gauge.tsx` (floating delta labels, lasting marks with keyboard tooltips, dimmed and pulsing
  states, instrument chips), `src/screens/MissionControl.tsx` (effect timing, 3-2-1 countdown, screen shake,
  clock jump that rides on the live clock), `src/sim/deltas.ts`, `src/sim/demo.ts` (?demo=1), a rumble sound,
  icons and delta chips on the results screen, keyframes in `styles.css`, 24 new tests (149 in total).
- Engine changes beyond "screen and CSS only", all small and tested: a `daysLost` effect really moves the clock
  ("wait a week" = 7 days, never past the end), each decision records the effect the engine applied, and the
  braking burn waits until every scheduled challenge has fired.
- Simplified: the correction-burn flame shows for the two-second effect window rather than 300 ms; the science bar
  itself only fills at arrival, so a science penalty shows as a label and a mark; no browser was available, so
  the visuals were checked by a five-lens review with adversarial verification plus a headless demo run.
- Review fixes applied: card backdrop lightened so arrival effects show, ring keyframes given units, the sprite
  slides by CSS, reduced motion covers every sprite state, the clock never counts from a negative day.
- Tests 149 in 12 files, `npm run build` passed.
- Open question for Kunal: should "wait a week" on the 4-day Moon trip cost fewer days (it now costs the rest of
  the trip, which the demo shows as a jump to the last day)?

## 2026-09-22 — Stage 8: Fit every screen on a laptop, and give challenges real-world context
- Built: cockpit `MissionControl.tsx` (full-viewport grid, landscape map, six compact gauges, three-line log
  strip, status and Fullscreen in the top bar, card over the map with a how-common badge, a "Why does this
  happen?" fold and coloured chips per option, ℹ popovers in the log), `DesignLab.tsx` accordion,
  `Launch.tsx`, two-column `Result.tsx`, `events.json` context (whatIsIt, realExample, howCommon, affects),
  `src/sim/context.ts`, compact `Gauge.tsx`, `scripts/measure.mjs`. 43 new tests, 177 in 14; build passed.
- Measured with headless Chromium, `document.documentElement.scrollHeight`: at 1366×650 (and at 1920×1080 and
  1024×650) Home / Choose / Design Lab / Launch / Mission Control are all exactly one screen, Results 1115 px
  (scrolls once, allowed); cards 290–327 px (390 px unfolded), always inside the map; smallest text 12 px.
  At 850×650 the mission screens still fit but Choose mission and Launch with "Learn more" open scroll.
- Engine fixes the review found: the braking burn no longer starts while a challenge is still on the card,
  a delay is clamped to whole days that the trip really has (the Moon card said "+7 days" and cost 3.12), and
  a weaker signal now says it costs science too, because the score is multiplied by the signal.
- Simplified: under 800 px keeps the old stacked layout; `screenshots/` is generated, not committed.
- Open question for Kunal: keep `screenshots/` out of the repo, or add a few PNGs to the README?

## 2026-09-23 — Fix: Flight Director never calls a safe choice "worst"
- `src/ai/flightDirector.ts`: `decisionLines` now looks up the chosen option's `safe` flag in events.json.
  A safe choice that cost a little science is described as "the price of safety"; the word "worst" is gone and
  a risky option is called "your riskiest choice". Tests updated/added in `flightDirector.test.ts` and
  `Result.test.tsx`. 178 tests, build passed (verified in Kunal's reviewer environment).

## 2026-09-23 — Stage 9 Part 1: what a challenge is allowed to do (engine only)
- `src/sim/simulation.ts`: three rewards an option can give (`scienceBonus`, `daysSaved`, `fuelSaved`) plus
  `clearInsertionRisk`, which Part 2's aim-check needs; `gain` on every Decision; `kind` ("problem" or
  "opportunity") and `phase` ("early"/"mid"/"late"/"any") on an event; `follows` for events caused by one
  choice; `riskTaken` in SimState with the exported `riskLabel()`; new design flags (the scenario id,
  "outerPlanet" beyond 1.5 AU, "solar"). `settings.json` now draws 3–5 challenges per mission.
- Scheduling: the 15–85% window is cut into three equal slices and each event lands in a slice its phase
  allows, "any" filling the emptiest one. Still seeded, no repeats, weighted by chance, earliest first.
- Decisions I made on my own: a follow-up is dropped when its trigger is answered on arrival day (no trip
  left), never scheduled twice, and skipped when its own `onlyIf` is not met; `daysSaved` is capped at the
  current day so the clock cannot go before launch; `fuelSaved` cannot push fuel spent below zero; a "gain"
  needs a reward with no lasting harm, so fuel and days count as a price but a gamble does not.
- Balance after the rise to 3–5 events, unchanged physics: Moon preset 200/200, Mars tightest 146/200 (73%,
  was 161/200 with 2–4), Jupiter preset 200/200. Both above the Stage 9 floors, so no `chance` tuning yet.
- Tests 194 in 15 files (16 new in `src/sim/__tests__/rewards.test.ts`), `npm run build` passed.
- Open question for Kunal: Mars sits at 1.52 AU, so the "beyond 1.5 AU" rule gives it the `outerPlanet` flag
  and Part 2's gravity-assist card. Keep that, or raise the line so only Jupiter counts?

## 2026-09-23 — Stage 9 Part 2: ten new challenges, three follow-ups
- `src/data/events.json` grows from 5 to 18 events: 10 new challenges (debris, micrometeoroid, sunlight push,
  planetary protection, gravity assist, asteroid flyby, safe mode, no dish free, software bug, Jupiter
  radiation) and 3 follow-ups (damage found, aim check, extra data). Two of the new cards are opportunities
  that pay science or fuel back. `src/sim/context.ts` learned chips for the Part 1 reward keys.
- Balance needed no `chance` tuning: a bigger pool spreads the draw, so the tightest Mars design went up from
  161/200 to 173/200 even with 3–5 challenges a mission. Moon preset 200/200, Jupiter preset 200/200, average
  science up (Moon 14.5 → 15.6 of 18). Numbers written into BALANCE_NOTES.md.
- Not anticipated by the prompt, and changed on my own: four of the given real stories name no year (the Juno
  vault and all three follow-ups describe how spaceflight works, not one dated event), so the year rule now
  applies to dated stories and lists those four as standing facts rather than inventing dates. Six option
  labels stated a day count ("costs 10 days") that a 4-day Moon trip cannot keep, so the number now lives only
  in the chip, and an event with under a day left costs no days at all. `EVENT_DEFS` needs a narrowing cast
  because JSON widens `kind` and `phase` to string; a data test checks every value is one the engine allows.
- New data tests: every follow-up points at a real event and option, every `onlyIf`/`protectedBy` names a flag
  a design can have, every event is reachable by some mission, no "safe" option risks the spacecraft above 5%.
- Tests 227 in 15 files, `npm run build` passed. Played 900 seeded missions headlessly: opportunities and
  follow-up chains both appear in all three scenarios, and every mission still reached orbit.
- Open question for Kunal: "Wait one day for better tracking" is the debris option mission control picks when
  the tank cannot afford to dodge, and it carries a 1 in 20 risk. Keep that, or make dodging always affordable?

## 2026-09-23 — Stage 9 fixes and Part 3: showing chances, consequences and risk
- Four fixes first: `outerPlanet` now means beyond 2.0 AU (the asteroid belt), so Mars no longer qualifies and
  the gravity assist is Jupiter-only; `gravityAssist` chance 0.12 → 0.20 with Juno's own 2013/2016 story; the
  `daysSaved` effect key is gone (no event used it); and the balance sweep no longer reports a milestone line
  as a cause of failure — it skips milestones and takes the last sentence of the line that ended the mission.
- Tight Mars is now 171/200 (was 173 before the fixes; Mars lost two cards, one an opportunity). Moon preset
  200/200, Jupiter preset 200/200, both floors met with no `chance` tuning. BALANCE_NOTES.md rewritten.
- Part 3 on screen: opportunity cards are green with a "★ Opportunity" badge, a green countdown and a green
  status line that says "Take the chance, or stay on plan"; a follow-up card says "This is because of your
  choice on day N"; the top bar carries a Mission risk readout with a green/amber/orange/red dot, a tooltip
  and the Stage 7 highlight when a gamble is taken; results mark a chance that paid off with ➕ and a green
  chip; the Flight Director names a chain of consequences and a chance that paid off; six glossary entries.
- Own decision: the Flight Director still writes at most five sentences, so the consequence line takes the
  slot the praise line would have used. Kept the safe-choice wording exactly as it was.
- Measured again at 1366×650: every screen still one page, cards 323–429 px and always inside the map.
- Tests 231 in 15 files, `npm run build` passed. Screenshots of the two new card types in `screenshots/`.

## 2026-09-23 — Stage 9 finishing fixes
- Demo run rebuilt (`src/sim/demo.ts`): debris → asteroid opportunity → the follow-up it causes → sunlight
  push → safe mode, so `?demo=1` now shows a green card, a chain and three of the new problems. Icons added
  for all thirteen new events. Tests assert the run holds an opportunity and a follows event, that the cause
  comes before its follow-up, and that taking the chance really produces it.
- `followUpFor` records the day of the decision, not the day the clock jumped to, so the card and the results
  agree (the demo card reads "because of your choice on day 0" while the clock stands at day 3). A follow-up
  already on a scripted schedule now learns its cause instead of being skipped, which is what lets the demo
  show the because-line at a fixed time.
- Flight Director: "The the new instrument…" fixed with an article helper; when one choice is both the chance
  taken and the cause of a follow-up it is now a single sentence, which frees a slot under the five-sentence
  cap; and the "look where the missing points went" tip only appears when points really are missing, with its
  own line for a full score, which opportunities now make reachable.
- Own decision: the demo schedules the follow-up rather than waiting for the player, so judges always see it.
  If they decline the photograph it still appears, without the because-line. Taking it costs three days of a
  four-day Moon trip, so the last cards bunch near the target; the README says so.
- Tests 236 in 15 files, `npm run build` passed. Measured again at 1366×650: all five demo cards fit inside
  the map (341–459 px) and no screen scrolls but the results.

## 2026-09-23 — Stage 9 last fixes: over-plan science, and a demo that paces itself
- A chance taken can now bring home more science than the design planned for, so both readouts say it as a
  win instead of "22 of 18": the Flight Director writes "collected 22 science points — 4 more than the 18 you
  planned for", and the Mission Control gauge reads "22 points · 4 more than planned". The engine still does
  not cap the science; the bonus is the reward. Checked that the score, the success fraction and all three
  stars handle going over sensibly (they already did: full success asks for 90% or more, and the score counts
  every point), and pinned that in a test.
- `?demo=1` now runs Mars, not the Moon. The home screen shows one button, "Start the demo mission (Mars)",
  which picks the scenario, loads the ready-made design and launches in a single click. Cards are 8% of the
  trip apart instead of 6%: in a real browser they arrived at 2.9 s, 8.8 s, 13.7 s, 18.5 s and 24.4 s, about
  five seconds apart. A test asserts no two cards arrive within 5% of the trip of each other once the days a
  choice costs have been applied.
- Found while watching that demo run: the log said "Lost 9 days" where the card promised "+10 days", because
  the day count was floored after a floating-point subtraction (121.44 + 10 − 121.44 is 9.999999999999986).
  The engine now counts whole days the same way the card does. Regression test added.
- Tests 241 in 15 files, `npm run build` passed, balance unchanged (Moon 200/200, tight Mars 171/200,
  Jupiter 200/200).

## 2026-09-23 — Stage 10: make the UI teach
- Part 1 `src/physics/partEffects.ts`: every part card carries a second line saying what picking it would do
  to THIS mission, worked out live from the same formulas the Mission check uses. The lesson the reviewer
  asked for is visible: the large panels read "Makes about 2800 W at Moon" and "Makes about 104 W at Jupiter",
  the small dish goes from 100% of your science reaching Earth to 10%, and the ion engine says it needs 1000 W
  the whole way. No travel time on the engine card, because trip length comes from the scenario and route.
- Part 2 `src/data/provenance.json` + `Provenance.tsx`: a footnote on the Design Lab, Launch and Results
  screens opens a list marking all 14 kinds of number as a real formula, a real measurement or a game value.
  The focus trap now lives once in `components/Dialog.tsx`; the word list uses it too.
- Part 3 `src/physics/missionFacts.ts`: the mission cards swap bullets for three chips (sunlight, signal
  delay, launch window) in the Stage 8 chip style, coloured by the value — Jupiter's window is amber and
  Mars's is red, because Mars really is the rarer one.
- Part 4 `MissionSummary`: the spacecraft in one line on Launch and Mission Control, with the live fuel and
  the Stage 7 highlight when a challenge changes it. Part 5 `Timeline`: Launch → Cruise → Arrival burn →
  In orbit, read straight off the phase.
- Changed on my own: the ship line and the strip share one full-width row under the clock (a third row would
  have cost the map 36 px and pushed the tallest card out of it); instrument cards dropped the power and
  science figures from their spec line because the new effect line already says both; `LIGHT_MINUTES_PER_AU`
  and `formatSignalDelay` moved from `src/sim` into `src/physics/comms.ts` so physics no longer sits below sim;
  jsdom is a new devDependency, so Escape and focus-return are tested for real rather than by inspection.
- Measured at 1366×650 after all five parts: every screen 650 px except Results 1146 px (scrolls once,
  allowed), cards 341–441 px inside the map, ship line 16 px, strip 16 px, smallest text 12 px. Played all
  three scenarios end to end: every timeline reached "In orbit", and Escape closed the provenance panel back
  onto the button that opened it.
- Not done: "re-shoot docs/screenshots/ (Stage 6 list)" — Stage 6 was skipped, so that folder does not exist.
  The `screenshots/` folder that `npm run measure` writes is re-shot and current.
- Tests 273 in 19 files, `npm run build` passed.

## 2026-09-23 — Stage 10 Part 1 fixes: the Moon reads as a place, and the antenna group teaches
- The power line used `scenario.target`, so it read "at Moon". It now uses `targetProse` and reads "at the
  Moon"; Mars and Jupiter are unchanged.
- On the tutorial both antennas said "About 100% of your science reaches Earth", so the group taught nothing
  where a beginner meets it first. When two antennas really do read the same for the current mission, the
  line now adds what that same antenna would manage on the hardest mission in the game, worked out from the
  data: the tutorial design now shows "About 100% here — but only about 7% at Jupiter" for the small dish and
  "…67% at Jupiter" for the large one, so the two cards differ and the choice has a visible point.
- The comparison is skipped where it would say nothing: on Jupiter itself, or when the antenna loses nothing
  there either (a single camera gets 100% home even at Jupiter, and then the plain line stands).
- Tests 274 in 19 files, `npm run build` passed.

## 2026-09-23 — Cleanup: one source for the chips, and all authored English in src/data
- `events.json` no longer carries `affects` / `protectedAffects` (51 duplicated arrays gone) and the two
  fields are off `EventOptionDef`. Nothing on screen ever read them: every chip comes from `affectsLabels()`
  in `src/sim/context.ts`. The sync test that compared the two copies is gone, replaced by tests that pin the
  chips a representative option really produces (a plain cost, a lasting cost, a gamble, the same gamble when
  protected, an opportunity, a clean-up burn, doing nothing) plus a sweep asserting no option is ever
  chip-less. Drift is now impossible by construction rather than caught by a test.
- `src/data/directorLines.json` holds every sentence the Flight Director can say: the tips, the why() lines
  with both wordings of each two-way case, the decision lines, the real-mission line and the design
  comparison. `flightDirector.ts` now only decides which line fits and what goes in its blanks, through one
  `say()` helper. Output is unchanged, which the existing exact-string tests prove; a new test asserts no
  explanation is left with an unfilled `{placeholder}` or a double space, and that every outcome has both a
  why line and a tip.
- I also moved `compareWithRealMission`'s four fragments, which the brief did not list, because the stated
  goal was that no authored English stays in a .ts file. Sentences still living in TypeScript, for a later
  pass if you want them moved: the engine's outcome lines in `src/sim/simulation.ts`, the chip wording in
  `src/sim/context.ts`, the part-effect lines in `src/physics/partEffects.ts` and the screens' own labels.
- Tests 277 in 19 files, `npm run build` passed, every screen still fits at 1366×650.

## 2026-09-23 — Fix: the oversized-panels sentence judges the panels you bought
- My directorLines refactor gave `why()` one shared `powerMade` binding (`flown ? powerAtTargetW : powerMadeW`).
  That is right for "not enough power", which is about the flight, but wrong for "oversized panels", which
  judges the panels you chose: a 10% power penalty picked up on the way made it print 2520 W where the Design
  Lab said 2800 W for the same panels.
- The oversized-panels sentence now has its own `{panelOutput}` placeholder bound to `checks.powerMadeW`, so
  the two sentences cannot share a value by accident again. "Not enough power" is unchanged.
- Tests: a flown Moon mission that tilts its panels (10% power penalty) must still say "make 2800 W", the
  Design Lab figure, and must not print the reduced one; and a flown Jupiter mission short of power must
  still print the reduced in-flight figure, so the fix did not swap the bug to the other sentence.
- Tests 279 in 19 files, `npm run build` passed.

## 2026-09-24 — Stage 11: make it look like space, and let the player fall into it
- Part 1 `src/components/Starfield.tsx` + `src/sim/sky.ts` + `src/data/sky.json`: 260 stars, a Milky Way band,
  two galaxies and a nebula, all from the seeded generator, drawn inside the map's own SVG. Built once and
  memoised on the map size, so the clock ticking 60 times a second never touches a star. The stars do not move
  as the spacecraft travels, which is correct, and the glossary now says why.
- Part 2: the Sun got a warm core and a soft corona gradient, planets a bright rim, orbits and the trail more
  light, the spacecraft a halo, and every label a dark pill. A test reads the rendered SVG and checks no sky
  element ever carries a mission class and that the sky is painted first.
- Part 3: one "⛶ Space view" button switches an immersive layout and asks for browser fullscreen. A refused or
  missing fullscreen still gives the layout; Escape or leaving fullscreen any other way exits both. Panels
  float (strip top left, log top right, gauge HUD along the bottom) and step aside to 0.25 opacity when the
  spacecraft, the target or the Sun passes under them. The challenge card still appears and still pauses.
- Part 4: a scale bar sized from the map's own AU-to-pixel factor ("0.002 AU · 299 thousand km" at the Moon,
  "1 AU · 150 million km" at Mars), the whole transfer path with the part still to come faint and dashed, and
  a HUD line "Orbits and distances to scale. The stars are decoration." beside the provenance button.
- Measured: 60 frames a second on a Moon mission at 4x, 335 SVG elements against the 600 budget, smallest
  on-screen text 12 px, every screen still one page at 1366×650. Contrast of HUD text over a panel over the
  brightest Milky Way: 16.39:1 bright, 14.31:1 dim; over a full-brightness star behind the panel, 6.93:1 and
  6.05:1. All computed in the test from the stylesheet and sky.json, never eyeballed.
- Not anticipated by the prompt: the contrast check failed at 2.14:1 for muted text with a star behind it, so
  the scrim went from 0.55 to 0.68 (0.85 without blur) and the panels got two named text colours, as the
  stage's own rule demands. The map's orbit radius had to become a share of the box rather than a fixed 170,
  or a window-shaped box cropped the orbits. The map box now takes the window's shape in space view, because
  a fixed 16:10 viewBox letterboxed with black bars instead of filling the screen. Map-unit text is halved in
  space view so it looks the same size. `?raw` CSS imports come back empty under vitest, so two tests read
  styles.css from disk behind a four-line type shim rather than pulling in all of @types/node.
- Tests 322 in 25 files, `npm run build` passed. Screenshots re-shot, including the space view and a
  challenge card open in it.

## 2026-09-24 — Stage 11 fixes: an honest path ahead, and panels that keep out of the way
- The planned ellipse no longer implies an arrival the engine has not earned. The map draws a short lead,
  the next 10% of the trip, fading from the trail colour to nothing at its tip. The whole remaining ellipse
  is behind a "Show flight plan" toggle in the HUD, off by default, captioned "Planned path — this is where
  the plan says you will be." (This replaces the earlier always-on ellipse.)
- Panels split and shrunk as Part 3 intended: clock, scale, mission risk and the speed buttons in a 360×87
  panel hugging the top-left corner in two rows; the log top right at 340 wide; the gauges centred along the
  bottom at 971×63, so nothing spans the full width. Panel scrim back to 0.55 with blur (0.72 without), and
  both panel text colours raised so WCAG AA still holds over the brightest sky: 5.3:1 and 5.6:1 in the worst
  case, computed in the test.
- HUD readouts are one short line each with a name, a number and a unit: "Fuel 351 kg", "Power 540 W",
  "Signal 99%", "Delay 1.3 seconds", "Distance 384,467 km", "Science 0 pts". The normal Mission Control keeps
  its longer wording, which its tests still pin.
- Verified with a browser probe at 1366×768 and 1366×650: no panel overlaps either orbit ring, any planet or
  the spacecraft. Checked by computing the rectangles against the drawn circles, not by eye.
- I could not reproduce the third report. At both sizes the gauges render inside the bottom panel with their
  labels; the only 📻 in the codebase is a mission-log icon for the ground-station event, and nothing puts
  🌍 or ☀️ in a gauge. It may have been a stale dev server or an old `dist`. The compact labelled HUD asked
  for is in place either way, and no text is clipped at the edges.
- Also changed on my own: in space view the title, the ship summary line, the timeline and the mute button
  step out of the strip, because they cannot fit two rows at 360px. The status line stays for screen readers,
  visually hidden. The lead path needed `fill: none`, without which it painted as a black blob; a test pins it.
- Tests 324 in 25 files, `npm run build` passed, 60 fps and 334 SVG elements unchanged.

## 2026-09-24 — Space view: what the floating emoji actually were
- Found the cause. They were not gauges. They were the Stage 7 trail markers from `MapEffects`, each an
  event icon plus the mission DAY, drawn bare on the map: "🛰️ 13", not a reading of 13 anything. That also
  explains the symbol changing between frames while the number held: different decisions, different icons.
- Real bug behind the doubled digits: the markers were drawn one per DECISION. Two decisions taken on the
  same day sit on the same point of the trail, so the same label was painted twice, a glyph's width apart.
  They are now grouped by day, one marker each, carrying every icon from that day, and the text reads
  "🛰️🔭 Day 13" on a dark pill so it can never be mistaken for a gauge or lost against a star.
- Space view now draws no trail markers at all, so nothing rides bare over an orbit. They stay in the
  normal view, where they sit inside the map panel. Event marks and instrument chips are no longer passed
  to the HUD gauges either, so no event symbol can reach the HUD by any route.
- Each gauge now has one constant icon defined beside its label in `GAUGE_ICON` (⛽ 🔋 📶 ⏱️ 📏 🔬), shown
  only in the HUD: "⛽ Fuel 196 kg", "🔋 Power 304 W", "📶 Signal 22%". A test pins icon to gauge, checks no
  two gauges share one, and checks none of them is an event icon, which is what went wrong in the first place.
- Verified in a browser at 1366×768 and 1366×650, after answering all five demo cards: no panel overlaps an
  orbit, a planet or the spacecraft, and the only emoji left over the map is the challenge card's own badge.
- Tests 331 in 26 files, `npm run build` passed, 58 fps and 327 SVG elements.

## 2026-09-30 — The sky does not stop when the mission does
- Reported: after a successful arrival the planets froze in their orbits, and the spacecraft circled a
  planet that was standing still. Cause: the animation loop returned early once the phase was "orbit" or
  "failed", so nothing on the map moved again.
- `coastAngles(sim, extraDays)` (simulation.ts) is the whole of the new physics: Earth and the target on
  the day `missionDay + extraDays`, from the same `planetAngle` the cruise uses. At 0 extra days it gives
  back exactly the angles the mission ended on.
- Mission Control now keeps a frame loop after the mission ends, advancing the coast at the same clock
  scale shown on screen ("1 sec = 5 days"), and `mapGeometry` takes those days. Reduced motion: no loop.
- The spacecraft rides with the planet: the orbit group is drawn at the planet, so it follows it, and a
  faint dashed parking orbit shows the path it is on. The trail no longer stops dead at the arrival point
  — it carries on along the planet's own orbit, because that is where the spacecraft is now being carried.
- "In orbit for N days" sits by the scale bar on the map, not in the top strip: tried there first and it
  cut the status line from "Orbit captured! The spacecraft…" to "Orbit…". A glossary entry says why the
  planets keep moving and that the little orbit is drawn much wider and slower than a real one.
- Tests 348 in 28 files (`coast.test.ts`, `coast.test.tsx`), `npm run build` passed, 60 fps, 327 SVG
  elements, all screens fit; browser-checked at 1366×768 and 1366×650 in both views.

## 2026-09-30 — Stage 12 Part 1: the spacecraft is the one you built
- `src/sim/shipLayout.ts` (pure) turns a Design into shapes; `src/components/Spacecraft.tsx` draws them as
  `<ShipSprite>` on the map and `<ShipSchematic>` for the challenge card. Sizes come from parts.json:
  bus by mass (cube root), panel length by √watts, dish width by √dataRate, sensor box by instrument mass.
  Scale factors live in `src/data/ship.json`, none in the components.
- The white triangle is gone. The map now shows your machine: an RTG design has no wings at all, large
  panels are twice the span of small ones, three instruments are three sensor boxes, an ion engine is a
  longer grid than a chemical nozzle. Every part carries `data-part` for Part 2's highlight.
- Sprite is 24px on a 1366×650 laptop (budget 28), 15 shapes, one fixed scale for every design with a cap
  for the giants, so a bigger design is never drawn smaller. The halo now fits the ship instead of swamping it.
- The burn flame starts at the back of *this* ship (`spriteTailX`) and only the engine end glows, so the
  design stays readable mid-burn.
- Tests 370 in 30 files (13 layout, 9 component), `npm run build` passed, 60 fps, 345 SVG elements, all
  screens fit. Checked by eye at 3× on the real map and as a four-design comparison sheet.

## 2026-09-30 — Stage 12 Parts 2 and 3: it happens on your spacecraft, and you watch it happen
- Part 2: the challenge card is now two columns — the schematic of the machine you built on the left with
  the part that is going wrong marked and damaged, the words and the option buttons on the right. Every
  event in events.json gained `affectsPart`; a data test requires it and requires a part the schematic draws.
- One look per event, from `damageFor()`: dust dulls the panels, a strike punches one hole, a fault goes
  dark, lost signal turns the dish away. Hovering or focusing an option rings the part THAT option would
  change (`optionPart()`), while the broken part stays marked — the two never fight for the same mark.
- The part is named in the player's own words, taken from what they bought: "Large dish antenna", not "the
  antenna". No new English was invented for it.
- Part 3: a two-second beat plays over the map before the card (`beatFor()` → 8 beats: dust, rock, dish,
  flare, blink, light, chance, alert). A click or Escape skips it, reduced motion skips it, and a new
  "🎬 Animations" toggle turns it off for the session. It costs no mission time: the engine has already
  stopped the clock, and a test pins the day as equal whether it plays, is skipped, or never runs.
- Accessibility: the schematic is aria-hidden with nothing focusable in it, and the card is played from the
  keyboard alone — in jsdom AND for real in `npm run measure`, which now fails if Tab and Enter cannot answer
  a challenge. That check caught a real bug: the beat had stopped the card taking focus when it opened.
- Tests 393 in 32 files, `npm run build` passed, 60 fps, 349 SVG elements, every card still inside the map.
- Open for Kunal: Parts 4 and 5 (lit spheres with real phases, per-body character and engine plumes) are
  deliberately not started — the stage says to deploy and finish the submission pack first.

## 2026-10-29 — Stage 13: Team mode (2–4 players, one screen)
- Built for the NASA brief's "collaboration for up to four participants". `src/data/team.json` (roles, goals,
  scoring, all English), `src/sim/team.ts` (pure: roles, ownership, goals, bonus), `screens/TeamSetup.tsx`,
  `components/TeamGoals.tsx`; store gains `team`, `signoffs`, `startTeam`, `playSolo`, `toggleSignoff`.
- Four roles: Mission Lead (body, rocket, launch: keep budget unspent), Engineer (power, engine: spare power),
  Science (instruments: science points), Comms (antenna: data home). With 2–3 players roles double up, paired
  so "save money" and "do more science" always sit with different people.
- Design Lab: owner badge on every group + live Team goals. Launch: every player must press "I agree"; any
  change to design, month or route clears all of them. Challenge cards name whose call it is (from affectsPart).
  Results: each goal ✅/⬜ and Team score = mission score + 10 per goal + 20 if all four are met.
- Decisions: goals are tuned per scenario; a test brute-forces every design and requires more than one different
  spacecraft that meets all four goals (no single right answer), and that "best of everything" fails.
  Solo play is unchanged. Hot-seat only — no network play (no backend, per rule 8).
- Tests 423 in 34 files (+30), `npm run build` passed, `npm run measure`: all screens fit, also checked in team
  mode at 1366×650 in headless Chromium.
- Open for Kunal: online play for teams on separate devices? Should the Flight Director comment on teamwork?

## 2026-11-03 — Stage 14: clearer Design Lab cards and Mission Control controls
- Asked for by the team: part choices and the cockpit buttons looked messy to a first-time player.
- Design Lab (`DesignLab.tsx`): every part is now a card (`PartOption`) with a big tick when chosen, the name
  and what it is on one line, cost / mass / power as icon chips, and a 👉 line for what it does on this mission.
  The real radio/checkbox stays inside (sr-only) for keyboard and screen readers. The fuel slider sits in its
  own box with a proper "✨ Set to enough" button.
- Resource bars: `checks.ts` gives each Bar a `hint` ("uses 50 W · makes 260 W there"); the bar shows OK /
  Fix this instead of a bare "5.13 / 2.81". Test: `physics/__tests__/barHints.test.ts`.
- Mission Control: speed is one joined "Speed" switch (⏸ Pause · ▶ 1x · ⏩ 4x) with tooltips; Sound,
  Animations and Space view are a quieter group behind a divider, so they no longer compete with speed.
- Spacing was tightened so the Design Lab still fits 1366×650 with the instruments open.
- Tests 425 in 35 files, `npm run build` passed, `npm run measure`: all screens fit.

## 2026-11-04 — Stage 15: 3D view of the flight
- New "🧊 3D view" button in Mission Control swaps the flat map for a three.js scene (and "🗺️ Flat map" back).
  Lit, textured Sun / Earth / Moon / Mars / Jupiter (surfaces painted on a canvas, no image files), glowing
  atmospheres, dashed orbit rings, the planned path faint and the flown path bright, a star field with a Milky Way
  band. The spacecraft is built in 3D from `shipLayout()`, so it is the one the player designed, with an engine
  plume while burning. Camera: drag to turn, scroll to zoom, "Whole trip", "Follow spacecraft", "Auto-spin".
- Files: `src/sim/scene3d.ts` (pure geometry from the simulation, same numbers as the flat map, 11 tests),
  `src/components/three/Flight3D.tsx` + `textures.ts`, `src/data/view3d.json` (all sizes, colours, words).
- RULE EXCEPTION for Kunal: adds `three` (+ `@types/three`), against "no new UI libraries". The player asked for
  "a very cool 3D view" and said to reverse it if it gets messy. It is lazy-loaded: the main bundle is unchanged
  and the 3D chunk (~130 kB gzipped) downloads only on the first click. To remove: delete `src/components/three/`,
  the button and lazy import in MissionControl.tsx, and `npm uninstall three @types/three`.
- Simplified: map effects (storm particles, beats) are flat-map only; in 3D the challenge card opens at once.
  Sound and Animations are icon-only in the cockpit bar to make room (words on hover and for screen readers).
- Tests 438 in 37 files, `npm run build` passed, `npm run measure`: all screens fit.

## 2026-11-04 — Stage 16: sound effects and a new home screen
- Sound (`src/sound/sound.ts`, all Web Audio, no files): button tick, rising "yes" for main buttons, a bloop
  that rises when a part goes on and falls when it comes off, a cruise hum (two slightly detuned low notes over
  soft noise; quieter when paused or a card is open, higher at 4x), the arrival-burn roar, 3-2-1 ticks, ticks in
  the last 5 s of a decision, a four-note chime for orbit and a falling tone for a miss. Clicks come from one page
  listener (`components/UiSounds.tsx`), so screens are untouched; `data-sound="none"` opts a button out.
  Turning sound on plays a blip so the player knows it works. Still OFF by default (classrooms, browsers).
- Home (`screens/Home.tsx`): fixed space backdrop (nebula glows, 160 twinkling stars, a shooting star), gradient
  title, an animated mini solar system with a spacecraft flying a transfer ellipse, glass step cards, mission
  chips that jump straight to a mission, and the sound switch. Reduced motion stops every animation.
- Tests 443 in 37 files (+5 sound), `npm run build` passed, `npm run measure`: all screens fit. Checked by eye at
  1366×650, 1920×1080 and 390×844.

## 2026-11-04 — Stage 17: Mission goal + orbit choice
- New "Mission plan" screen (`screens/MissionPlan.tsx`) between Choose Mission and the Design Lab: pick a goal
  (Moon 3, Mars 3, Jupiter 2) and an orbit (2 per target, like LRO/Chandrayaan, Mangalyaan/MRO, Juno/Galileo).
- Real physics in `physics/orbits.ts`: capture burn from the arrival hyperbola (energy + vis-viva) and Kepler's
  period. Juno comes out at 0.54 km/s, LRO-style lunar orbit 0.80 km/s. Game values in `data/plans.json`.
- `physics/plan.ts`: goal weights per instrument (×0.5–×2) and an orbit-fit multiplier on science.
  `runChecks` takes an optional plan; the orbit only changes the braking burn by the real difference.
- Store `plan` + setObjective/setOrbit (clear team sign-offs). Sim config carries the plan and uses its burn.
  Design Lab shows the plan with "Change plan" and tags instruments "⭐ Great / Less useful for your goal".
  Results and the Flight Director summary include the plan.
- Decision: the first goal + usual orbit reproduce the old numbers exactly, so balance and old tests hold.
  Jupiter's insertionDeltaV changed 1.5 → 0.54 (real Juno value); total Δv unchanged, cruise share larger.
- Tests 466 in 39 files (+23: orbit physics, plan data, brute force "every goal winnable on its best orbit",
  screen flow). `npm run build` passed. `npm run measure`: all screens fit, Mission plan included.
- Open for Kunal: should team-mode science goals scale with the chosen goal? Data/lifetime phase is next.

## 2026-11-05 — Rename: Mission Architect → AstroVoyage
- Home title (`screens/Home.tsx`, now "Astro" + gradient "Voyage"), browser tab title (`index.html`),
  `package.json`/`package-lock.json` name, and the titles of README.md, CLAUDE.md and PROMPTS.md.
- Kept on purpose: the file name `Mission_Architect_Game_Design_Document.docx`, because that is the real file.
- Tests 466 passed, `npm run build` passed. Checked the Home page by eye.

## 2026-11-05 — Online: GitHub Pages with auto-deploy
- Live at https://harshvardhankaushik7755.github.io/astrovoyage/ · repo github.com/harshvardhankaushik7755/astrovoyage (public).
- `.github/workflows/deploy.yml`: every push to `main` runs `npm ci`, `npm test`, `npm run build`, then publishes.
  A failing test stops the deploy, so the last good version stays online. `vite.config.ts` reads `BASE_PATH`.
- Decision: Node 26 on GitHub (same as the dev machine); Node 22's npm 10 rejected the lock file.
- The online game has no AI server, so the Flight Director uses its built-in rules (the agreed fallback).
- Checked the live site in a browser: Home, Mission plan, Design Lab, launch and the 3D view, no errors.
- Open for Kunal: the repo is on Harshvardhan's account; add Kunal as a collaborator if he should push.
