# AstroVoyage

A browser game for the NASA Space Apps Challenge 2026 challenge **"Space Mission Design Game"**.
The player picks a mission, builds a spacecraft, checks the physics, and launches.

Design document: `Mission_Architect_Game_Design_Document.docx` (in the NASA folder).

## Run it (first time)

You need Node.js 18 or newer (https://nodejs.org).

```bash
cd astrovoyage
npm install        # downloads the libraries (one time, ~1 minute)
npm run dev        # starts the game at http://localhost:5173
```

Open the link in your browser. Every time you save a file, the page updates by itself.

## Other commands

```bash
npm test           # runs the physics and simulation tests
npm run build      # makes a production build in /dist
npm run preview    # serves the production build
npm run balance    # flies the balance designs 200 times each and prints the table in BALANCE_NOTES.md
npm run measure    # opens every screen at 1366×650 in headless Chromium, prints page heights, saves screenshots/
npm run measure:setup   # first time only: downloads the headless browser measure needs

```

## Open in VS Code

1. Open VS Code → File → Open Folder → pick the `astrovoyage` folder.
2. Open the terminal inside VS Code (View → Terminal) and run the commands above.
3. Recommended extensions: "ESLint" and "Prettier" (optional).

## Folder map

```
src/
  data/         parts.json, scenarios.json, events.json, realMissions.json  ← change game numbers here, no code needed
  physics/      rocketEquation.ts, power.ts, comms.ts, windows.ts, checks.ts ← the real physics (GDD Section 6)
  physics/__tests__/  tests that prove the formulas are right
  sim/          simulation.ts ← cruise engine: flight path, fuel, power, signal, orbit insertion, time scale
  sim/__tests__/      tests for the simulation
  store/        gameStore.ts  ← one place that holds all player choices (zustand)
  screens/      Home, ChooseMission, DesignLab, Launch, MissionControl, Result
  components/   ResourceBars (the four live bars), Gauge (Mission Control gauges)
  styles.css    look and feel
```

## What works today

- All 3 scenarios (Moon, Mars, Jupiter) with GDD numbers
- Design Lab with 6 part groups as an accordion (one open at a time) and 4 live bars (budget, mass, power, fuel Δv)
- All 4 launch checks + comms check, with plain-English error messages
- Launch calendar with green launch-window band, Fast/Slow route
- Results screen: score and three stars (GDD Section 8), the Flight Director in a chat bubble (rule-based, or an AI model through the optional server), every decision with a ✅ or ⚠️, and a comparison with the real mission
- Cruise simulation engine (`src/sim`): Hohmann-style flight path, fuel burn, power and signal along the way, orbit insertion that can fail, mission log, time scale
- Mission Control screen: live map (Sun or Earth in the centre, planets moving, spacecraft on its transfer path with a trail), six gauges, mission clock with Pause / 1x / 4x, mission log, orbit insertion burn with success or fly-by
- Design Lab button "Load a design that works": fills in a tested design, launch month and route for the current mission
- Challenges: 2 to 4 surprise events per mission (solar storm, dust on the panels, course drift, lost signal, instrument fault) with a decision card, a 20-second countdown, protections that soften them, and a record of every decision on the results screen
- Every part card says what choosing it would DO to this mission, worked out live from the physics: the same solar panels read "Makes about 600 W at Moon" and "Makes about 22 W at Jupiter", and the small antenna goes from 100% of your science reaching Earth to 10%
- "Where the numbers come from": a footnote on the Design Lab, Launch and Results screens opens a list marking every number as a real formula, a real measurement or a game value
- Mission cards carry three chips that say how hard a mission is (sunlight at the target, signal delay, launch window), coloured by the value
- The spacecraft you built follows you as a one-line summary on the Launch and Mission Control screens, with the live fuel figure
- A four-step strip, Launch to In orbit, shows where the mission is without reading the log
- Help: a "?" button on the Design Lab opens a word list in simple English (Δv, Isp, launch window, AU, RTG and more, from the GDD)
- Home screen: a three-step "How to play" strip and a "Try the tutorial (Moon)" button
- Accessibility: keyboard focus rings on every control, arrow keys move through part choices, aria labels on the bars and gauges, and a text mark next to every red or green signal
- Sound: a launch whoosh and an alert beep made with the Web Audio API (no audio files), off by default, with a mute button on the Launch and Mission Control screens
- Cause and effect: every challenge is shown three times, when it arrives (storm particles, dust haze, a drifting path, a broken signal line, a faulty instrument), the moment you decide (shaking, sparks, a shield, puffs, an engine flame, delta labels on the gauges, a clock that jumps forward when you lose days) and for the rest of the trip (marks on the gauges and on the trail). Open the game with `?demo=1` to see all five within the first half-minute of a Moon mission
- Fits a laptop: at 1366×650 no screen needs a vertical scrollbar (Mission Control is a full-screen cockpit: map left, six compact gauges right, a three-line log strip below, the challenge card over the map; the Design Lab is an accordion; the Launch calendar sits beside the route choice). Only the results screen may scroll. Verified by `npm run measure`
- Every challenge teaches something: the card says what the thing is, tells a real story with a year (Opportunity 2018, Mars Odyssey 2003, New Horizons 2015, the 2021 Mars solar conjunction, Hubble 2021), shows how common it is, and every option carries coloured chips saying exactly what it changes (the same words the engine uses). The mission log has an ℹ button on every challenge line, and the results screen repeats the chips and the story
- Works on phones and tablets: every screen stacks into one column under 800 px
- 3D view: a button in Mission Control shows the same flight in 3D (three.js, loaded only when pressed): lit planets, orbits, the path, and the spacecraft you built. Drag to turn, scroll to zoom, or follow the spacecraft
- Team mode (2–4 players on one screen): each player gets a role (Mission Lead, Spacecraft Engineer, Science Lead, Communications Lead) with the parts they own and a goal that pulls against the others. Everyone must agree before launch, challenges go to the player whose part is hit, and the results show each goal and a team score

## Not built yet (next stages, see PROMPTS.md and GDD Section 13)

- Art and more polish

## Where the numbers come from

See GDD Section 17. Physics formulas are real. Part masses, costs, budgets and event chances are game values — tune them in `src/data/*.json`. The Stage 5 balance pass, with the designs tested and the results, is in `BALANCE_NOTES.md`.

## AI Flight Director (optional)

The results screen always shows an explanation written by simple rules. If you run the small
server in `/server`, the explanation is written by an AI model instead (Claude or OpenAI).
The game keeps working exactly the same without it.

1. Get an API key from Anthropic (https://console.anthropic.com) or OpenAI (https://platform.openai.com).
2. Start the server in a second terminal. It reads the key from the environment:

   ```powershell
   # Windows PowerShell
   $env:ANTHROPIC_API_KEY = "sk-ant-..."     # or: $env:OPENAI_API_KEY = "sk-..."
   npm run server
   ```

   ```bash
   # macOS / Linux
   ANTHROPIC_API_KEY=sk-ant-... npm run server
   ```

3. Tell the game where the server is: copy `.env.example` to `.env.local` (it sets
   `VITE_FLIGHT_DIRECTOR_URL=http://localhost:8787/explain`), then restart `npm run dev`.

Settings, all optional: `FLIGHT_DIRECTOR_PROVIDER=anthropic` or `openai` (otherwise the server uses
whichever key it finds, Anthropic first), `ANTHROPIC_MODEL` (default `claude-opus-5`), `OPENAI_MODEL`
(default `gpt-4.1-mini`), `PORT` (default 8787). Check it is running at http://localhost:8787/health.

The game sends the server a small JSON report about the mission (parts, checks, decisions, outcome),
never anything personal. If the server is off, slow (more than 6 seconds) or answers with an error,
the game silently shows the rule-based explanation instead.

## Demo mode (for testers and judges)

Open http://localhost:5173/?demo=1 and press **"Start the demo mission (Mars) 🚀"**. That one button picks
Mars, loads the ready-made design and launches, so you are watching a flying mission straight away.

Five cards arrive over the first half-minute of the cruise, chosen to show everything the game does: a
debris warning, a green **opportunity** (an asteroid worth photographing), the **follow-up that choice
causes** (which names the day you chose it), sunlight pushing the spacecraft off course, and the spacecraft
switching itself off. Each one is shown on the map and the gauges when it arrives, when you decide, and for
the rest of the trip, and the top bar tracks the mission risk you have taken.

The demo flies Mars rather than the Moon on purpose. Every cruise takes 60–90 seconds whatever the distance,
but a Moon trip is only four days long, so the three days the photograph costs would throw the last cards on
top of each other. On Mars those three days are a nudge in a 336-day trip and the cards stay evenly spaced.

## Screenshots

`npm run measure` plays a Moon demo at 1366×650 and saves one PNG per screen in `screenshots/`
(not part of the app): `01-home`, `02-choose`, `03-design-lab` (+ `03b` instruments, `03c` engine and fuel),
`04-launch` (+ `04b` Learn more open), `05-mission-control`, `06a`…`06e` one per demo card
(`06a-…-why-open` with the context unfolded), `06f-log-popover`, `06g-orbit`, `07-results`.
Measure another size with `npm run measure -- 1920 1080` (the same in PowerShell and in bash).
The first run needs the browser: `npm run measure:setup` (about 150 MB, downloaded once).
The script exits with an error if a screen scrolls, text drops under 12 px, a challenge card leaves the map,
or a card is missing its chips or its how-common badge.
