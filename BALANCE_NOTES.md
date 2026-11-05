# Balance notes (Stage 5)

Date: 2026-09-21. Everything here was measured with the real engine (`src/sim`), 200 random missions per
design, with mission control always taking the safest option. Re-run it any time with `npm run balance`.

## The three goals

| Goal | Before | After |
|---|---|---|
| Moon is winnable on the first try by a beginner | The default parts with the fuel button reached orbit about 78 times in 100: the button left 12 kg of spare fuel, and a course correction cost 30 kg, so mission control had to gamble on the drift | 200 of 200 |
| Mars on a Budget is hard but winnable with an ion engine or careful fuel | The ion engine could not be powered at Mars (needs 1000 W, the large panels made 866 W). Every chemical design under budget had under 20 kg to spare, so about one mission in five was lost to the drift gamble | Careful fuel on the light rocket: 200 of 200. Ion engine: 200 of 200. The tightest passing design still gambles (161 of 200), so Mars stays hard |
| Jupiter fails with small solar panels and succeeds with large panels or RTG | No instrument could pass the antenna check (signal factor 0.01), so only an empty spacecraft could launch. Large panels made 74 W, less than a camera and a dish need | Small panels fail the power check (22 W of 95 W). Large panels: 200 of 200. RTG: 200 of 200 |

## What changed (JSON only)

| Value | Before | After | Why, in one sentence for students |
|---|---|---|---|
| `parts.json` large solar panels, power near Earth | 2000 W | 2800 W | Bigger panels still make 104 W at Jupiter, enough for a camera, a magnetometer and the big dish, and 1212 W at Mars, enough to run the ion engine. Juno's real panels make about 14 000 W near Earth. |
| `parts.json` light rocket, lift capacity | 2000 kg | 2200 kg | A Mars ship on a budget can now carry about 200 kg of spare fuel for surprises on the way. |
| `settings.json` fuel button reserve (`fuelMargin`) | 1.05 | 1.15 | "Set to enough + 15% reserve" leaves enough fuel for a correction burn after the braking burn. The button used to leave about 12 kg. |
| `scenarios.json` Jupiter signal factor | 0.01 | 0.05 | The big dish can now send home two thirds of a camera and a magnetometer's data from Jupiter. The small antenna still cannot, which is the lesson. |
| `events.json` course-correction burn | 30 kg | 8 kg | 30 kg on a 500 kg spacecraft is about 245 m/s, ten times a real mid-course correction; 8 kg is about 50 m/s, a realistic whole-cruise budget. |
| `events.json` shaking dust off the panels | 20 kg | 5 kg | Same reason: a small attitude move, not a major burn. |
| `events.json` rebooting an instrument | 5 kg | 1 kg | Turning the spacecraft costs almost nothing. |
| `scenarios.json` Mars preset fuel | 1600 kg | 1800 kg | The ready-made Mars design carries a reserve and still costs $118M of $150M. |
| `scenarios.json` Jupiter preset | no instruments, RTG, heavy rocket, 4500 kg | camera + magnetometer, large panels, medium rocket, 3500 kg | It now matches the mission goal (clouds and magnetic field) and costs $190M instead of $310M. |

Not changed: the ion engine still draws 1000 W (a 1 kW Hall thruster is realistic) and the Moon preset is the same
design the tests have used since Stage 1. One explanation rule in `src/ai/flightDirector.ts` was fixed alongside:
the Flight Director no longer calls the big dish "too weak" at Jupiter when nothing bigger exists and the
design already sends most of its data; the Design Lab shows the data fraction before launch anyway.

## Designs tested and results

Output of `npm run balance` after the changes. "Failures" lists what the log said when a mission was lost.

| Scenario | Design | Parts | Fuel kg | Cost $M | Checks | Orbit (200 runs) | Avg science | Failures |
|---|---|---|---|---|---|---|---|---|
| Moon Orbiter | beginner: default parts + the fuel button | small, camera, solarSmall, antSmall, chemical, light | 853 | 98.5/250 | pass | 200/200 | 7.8 of 10 | - |
| Moon Orbiter | cheap | small, camera, solarSmall, antSmall, chemical, light | 1000 | 100/250 | pass | 200/200 | 7.8 of 10 | - |
| Moon Orbiter | balanced (preset) | small, camera+magnetometer, solarSmall, antSmall, chemical, medium | 1400 | 147/250 | pass | 200/200 | 14.5 of 18 | - |
| Moon Orbiter | over-built | large, camera+spectrometer+radar, solarLarge, antLarge, chemical, heavy | 6000 | 437/250 | FAIL: over budget by $187M | - | - | - |
| Mars on a Budget | tightest design that passes the checks | small, camera, solarSmall, antLarge, chemical, light | 1550 | 116/150 | pass | 161/200 | 9.0 of 10 | 39x off course and flew past Mars |
| Mars on a Budget | cheap: light rocket, careful fuel | small, camera, solarSmall, antLarge, chemical, light | 1600 | 116/150 | pass | 200/200 | 8.9 of 10 | - |
| Mars on a Budget | balanced (preset) | small, camera, solarSmall, antLarge, chemical, light | 1800 | 118/150 | pass | 200/200 | 8.9 of 10 | - |
| Mars on a Budget | ion engine | small, camera, solarLarge, antLarge, ion, light | 200 | 134/150 | pass | 200/200 | 8.9 of 10 | - |
| Mars on a Budget | ion engine with only the fuel button | small, camera, solarLarge, antLarge, ion, light | 103 | 133/150 | pass | 188/200 | 8.5 of 10 | 12x off course and flew past Mars |
| Mars on a Budget | over-built | medium, camera+spectrometer+weather, solarLarge, antLarge, chemical, heavy | 5000 | 337/150 | FAIL: over budget by $187M | - | - | - |
| Jupiter Explorer | small solar (must fail) | small, camera, solarSmall, antLarge, chemical, heavy | 4500 | 265/900 | FAIL: not enough power at the target | - | - | - |
| Jupiter Explorer | large solar | small, camera, solarLarge, antLarge, chemical, heavy | 4500 | 277/900 | pass | 200/200 | 8.6 of 10 | - |
| Jupiter Explorer | RTG | small, camera+magnetometer, rtg, antLarge, chemical, heavy | 4500 | 340/900 | pass | 200/200 | 10.6 of 12 | - |
| Jupiter Explorer | balanced (preset) | small, camera+magnetometer, solarLarge, antLarge, chemical, medium | 3500 | 190/900 | pass | 200/200 | 10.6 of 12 | - |
| Jupiter Explorer | over-built | large, camera+magnetometer+spectrometer, rtg, antLarge, chemical, heavy | 9000 | 495/900 | FAIL: not enough power; antenna too weak | - | - | - |

Reading the table:
- The over-built designs fail on purpose: on the Moon and Mars they blow the budget, and at Jupiter three
  instruments need more power than the nuclear battery makes and more data than the dish can send.
- Average science is below the maximum because the safest choices sometimes cost science (switching
  instruments off in a storm, waiting a week after a lost signal). Winning is easy; a perfect score is not.
- Mars stays hard at the edge: the very cheapest passing design cannot afford an 8 kg correction burn, so it has
  to gamble on the drift about a third of the time. Fifty more kilograms of fuel fixes it, which is the lesson.
- An ion ship with only the button fuel (103 kg) loses 6 percent of missions the same way; the Flight
  Director's "carry a fuel reserve" tip applies.

## How the numbers were chosen

Three independent proposals were written from different angles (fewest changes, real-world physics, the
player's experience), each backed by its own headless runs, and three judges scored them from the beginner's,
the physics teacher's and the engineer's point of view. The result above takes the small-change core
(panels, rocket, reserve, presets), the physics proposal's realistic event fuel costs, and keeps the Jupiter
signal factor honest rather than raising it to make every Jupiter flight read as perfect.

Open questions for the project lead:
- Should the ion engine draw 400 W (one Hayabusa-class thruster) instead of 1000 W? It would then run on the
  small panels at Mars, making ion the obvious Mars answer rather than a clever one.
- Is a 15 percent reserve on the fuel button the right teaching choice, or should the button stay at "just
  enough" and let the challenges teach the reserve?

---

# Stage 9 Part 2 — the pool grows from 5 challenges to 18

Date: 2026-09-23. Same method: 200 seeded missions per design, mission control always taking the safest
option, `npm run balance`. Two things changed at once, so they are listed together.

| Change | Why |
|---|---|
| `settings.json` `eventsPerMission` 2–4 → 3–5 | With 15 drawable challenges a mission of 2 felt empty, and two runs in a row looked the same. |
| 13 new events in `events.json` (10 challenges, 3 follow-ups) | A beginning-middle-end shape, two chances that pay off instead of only punishments, and three events caused by an earlier choice. |

**No `chance` value needed tuning.** Both Stage 9 floors are met with the numbers the prompt gave, because a
bigger pool spreads the draw: the course-drift gamble that used to decide the tight Mars run now competes with
14 other challenges, so the tightest Mars design went **up** from 161/200 to 173/200 even while facing more
events per mission.

| Reference design | Stage 8 (5 events, 2–4 per mission) | Stage 9 Part 2 (18 events, 3–5 per mission) | Floor |
|---|---|---|---|
| Moon balanced (preset) | 200/200 | 200/200 | 90% |
| Mars tightest that passes the checks | 161/200 | 171/200 | 70% |
| Jupiter balanced (preset) | 200/200 | 200/200 | – |

### Four fixes after the first sweep

| Fix | Effect on the numbers |
|---|---|
| `outerPlanet` now means beyond 2.0 AU, the inner edge of the asteroid belt, so Mars no longer counts | The gravity assist and its aim check became Jupiter-only. Mars lost two cards, one of them an opportunity, so the tight Mars run slipped from 173/200 to 171/200 — still far above the floor. |
| `gravityAssist` chance 0.12 → 0.20 | It is now the only Jupiter-specific opportunity, so it should come up often enough to be the lesson it is meant to teach. Jupiter stays 200/200. |
| Removed the `daysSaved` effect key | No event used it. The engine, the chips and its test are gone. |
| The sweep picked the last log line as the failure reason | A lost week can push the clock past a milestone, so "Mid-course correction" was being reported as a cause of failure. It now skips milestone lines and takes the last sentence of the line that really ended the mission, which is why the reasons below read "The spacecraft was lost" instead of the choice that led there. |

Average science rose a little everywhere (Moon preset 14.5 → 15.6 of 18) because two of the new events are
opportunities that add science rather than take it away.

## Designs tested and results (full sweep)

| Scenario | Design | Parts | Fuel kg | Cost $M | Checks | Orbit (200 runs) | Avg science | Failures |
|---|---|---|---|---|---|---|---|---|
| Moon Orbiter | beginner: default parts + the fuel button | small, camera, solarSmall, antSmall, chemical, light | 853 | 98.53/250 | pass | 200/200 | 8.7 of 10 | - |
| Moon Orbiter | cheap | small, camera, solarSmall, antSmall, chemical, light | 1000 | 100/250 | pass | 200/200 | 8.7 of 10 | - |
| Moon Orbiter | balanced (preset) | small, camera+magnetometer, solarSmall, antSmall, chemical, medium | 1400 | 147/250 | pass | 200/200 | 15.6 of 18 | - |
| Moon Orbiter | over-built | large, camera+spectrometer+radar, solarLarge, antLarge, chemical, heavy | 6000 | 437/250 | FAIL: Over budget by $187M | - | - | - |
| Mars on a Budget | tightest design that passes the checks | small, camera, solarSmall, antLarge, chemical, light | 1550 | 115.5/150 | pass | 171/200 | 8.9 of 10 | 23x The spacecraft was off course and flew past Mars; 6x The spacecraft was lost |
| Mars on a Budget | cheap: light rocket, careful fuel | small, camera, solarSmall, antLarge, chemical, light | 1600 | 116/150 | pass | 191/200 | 9.1 of 10 | 9x The spacecraft was off course and flew past Mars |
| Mars on a Budget | balanced (preset) | small, camera, solarSmall, antLarge, chemical, light | 1800 | 118/150 | pass | 200/200 | 9.2 of 10 | - |
| Mars on a Budget | ion engine | small, camera, solarLarge, antLarge, ion, light | 200 | 134/150 | pass | 200/200 | 9.2 of 10 | - |
| Mars on a Budget | ion engine with only the fuel button | small, camera, solarLarge, antLarge, ion, light | 103 | 133.03/150 | pass | 189/200 | 8.8 of 10 | 5x The spacecraft was off course and flew past Mars; 6x The spacecraft was lost |
| Mars on a Budget | over-built | medium, camera+spectrometer+weather, solarLarge, antLarge, chemical, heavy | 5000 | 337/150 | FAIL: Over budget by $187M | - | - | - |
| Jupiter Explorer | small solar (must fail) | small, camera, solarSmall, antLarge, chemical, heavy | 4500 | 265/900 | FAIL: Not enough power at the target | - | - | - |
| Jupiter Explorer | large solar | small, camera, solarLarge, antLarge, chemical, heavy | 4500 | 277/900 | pass | 200/200 | 9.3 of 10 | - |
| Jupiter Explorer | RTG | small, camera+magnetometer, rtg, antLarge, chemical, heavy | 4500 | 340/900 | pass | 200/200 | 10.9 of 12 | - |
| Jupiter Explorer | balanced (preset) | small, camera+magnetometer, solarLarge, antLarge, chemical, medium | 3500 | 190/900 | pass | 200/200 | 10.9 of 12 | - |
| Jupiter Explorer | over-built | large, camera+magnetometer+spectrometer, rtg, antLarge, chemical, heavy | 9000 | 495/900 | FAIL: Not enough power at the target; Your antenna is too weak | - | - | - |
