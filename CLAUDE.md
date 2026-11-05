# AstroVoyage — project context for Claude Code

Read this before doing anything in this repo.

## What this is
A browser game for NASA Space Apps Challenge 2026, challenge "Space Mission Design Game".
The player picks a mission (Moon / Mars / Jupiter), designs a spacecraft under budget, mass, power and fuel
limits, launches it, watches a time-scaled simulation with surprise challenges, and gets a score plus an
AI "Flight Director" explanation. Target players: students 12+. Language in the UI: very simple English.

The design document is `../Mission_Architect_Game_Design_Document.docx` (GDD). Section numbers below refer to it.

## Stack (do not change without asking)
- React 19 + TypeScript + Vite. State in zustand (`src/store/gameStore.ts`). Tests in vitest.
- No new UI libraries. Plain CSS in `src/styles.css`. Animations with SVG + requestAnimationFrame.
- Physics is pure TypeScript in `src/physics/` with NO React imports, so it can be unit-tested.

## Folder map
```
src/data/       parts.json, scenarios.json, events.json, realMissions.json  ← all game numbers live here
src/physics/    rocketEquation.ts, power.ts, comms.ts, windows.ts, checks.ts (+ __tests__/)
src/store/      gameStore.ts — the ONLY place game state lives
src/screens/    Home, ChooseMission, DesignLab, Launch, Result  (add MissionControl here)
src/components/ ResourceBars
```

## Rules
1. **Numbers come from data files, never hard-coded in screens.** If you need a new number, add it to a JSON in `src/data/`.
2. **Physics stays real.** Rocket equation, inverse-square sunlight, launch windows are real formulas (GDD Section 6 and 17). Game values (costs, event chances) are tunable but must stay in JSON.
3. **Every physics/simulation function gets a vitest test** in `src/physics/__tests__/` or `src/sim/__tests__/`. Run `npm test` before finishing any task.
4. **`npm run build` must pass** (it runs `tsc --noEmit`) before you say a task is done.
5. **Plain English in the UI.** Short sentences. No jargon without a one-line explanation. A 12-year-old should understand every message.
6. **Small steps.** Finish one stage, make sure the game still runs end to end, then move on. Never leave the game in a broken state.
7. **Screens are dumb.** Screens read from the store and call store actions. Logic goes in `src/physics/` or `src/sim/`.
8. Do not add a backend unless the stage asks for it. The AI Flight Director must work with a fallback when there is no API key.
9. Keep the existing look (dark space theme, CSS variables in `styles.css`).

## Commands
- `npm run dev` — dev server on http://localhost:5173
- `npm test` — vitest
- `npm run build` — type-check + production build

## Time scale rule for the simulation (agreed design)
Every mission's cruise should take about 60–90 real seconds regardless of distance. So the time scale is per
scenario, not fixed: Moon ≈ "1 second = 1 hour", Mars ≈ "1 second = 4 days", Jupiter ≈ "1 second = 1 month".
Always show the scale and the mission clock on screen ("Day 142 of 240 · 1 sec = 4 days").
Speed buttons: Pause / 1x / 4x. The game auto-pauses when a challenge appears.

## Status log (required)
After finishing ANY stage or fix, append a short entry to `STATUS.md` at the repo root:
`## <date> — Stage N: <title>` followed by: what was built (files), what was skipped or simplified and why,
decisions you made on your own, test count and whether `npm run build` passed, and open questions for Kunal.
Keep each entry under 15 lines. This file is how the project lead reviews progress.
