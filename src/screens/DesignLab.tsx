import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import parts from "../data/parts.json";
import settings from "../data/settings.json";
import { useGame } from "../store/gameStore";
import { runChecks, findScenario } from "../physics/checks";
import { findObjective, findOrbit, instrumentTag, PLAN_TEXT } from "../physics/plan";
import { fuelNeeded } from "../physics/rocketEquation";
import { ResourceBars } from "../components/ResourceBars";
import { Glossary } from "../components/Glossary";
import { ProvenanceNote } from "../components/Provenance";
import { TeamGoals, OwnerBadge } from "../components/TeamGoals";
import { evaluateGoals, ownerOf } from "../sim/team";
import { antennaEffect, bodyEffect, engineEffect, instrumentEffect, powerEffect, rocketEffect } from "../physics/partEffects";

type GroupId = "body" | "instruments" | "power" | "comms" | "engine" | "rocket";
const GROUP_IDS: GroupId[] = ["body", "instruments", "power", "comms", "engine", "rocket"];

/**
 * Design Lab: live bars on top, the parts as an accordion on the left (one group open at a time, the
 * others show the current choice on one line), the Mission check on the right.
 */
export function DesignLab() {
  const { design, scenarioId, launchMonth, route, plan, team, setPart, toggleInstrument, loadPreset, go } = useGame();
  const scenario = findScenario(scenarioId);
  const r = runChecks(design, scenario, launchMonth, route, plan);
  const objective = findObjective(scenarioId, plan.objectiveId);
  const orbit = findOrbit(scenarioId, plan.orbitId);
  const [open, setOpen] = useState<GroupId | null>("body");
  const heads = useRef<(HTMLButtonElement | null)[]>([]);

  const body = parts.bodies.find((p) => p.id === design.bodyId)!;
  const power = parts.powerSources.find((p) => p.id === design.powerId)!;
  const antenna = parts.antennas.find((p) => p.id === design.antennaId)!;
  const engine = parts.engines.find((e) => e.id === design.engineId)!;
  const rocket = parts.rockets.find((p) => p.id === design.rocketId)!;
  const chosen = design.instrumentIds.map((id) => parts.instruments.find((p) => p.id === id)!.name);
  // Helper for the fuel slider: how much fuel would be enough right now, with the reserve from settings?
  const enoughFuel = Math.ceil(fuelNeeded(engine.isp, r.dryMassKg, r.dv.value) * settings.fuelMargin);

  // arrow keys move between the group headers; Enter or Space (the button's own click) toggles a group
  const onHeadKey = (i: number) => (e: KeyboardEvent<HTMLButtonElement>) => {
    const delta = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
    const to = e.key === "Home" ? 0 : e.key === "End" ? GROUP_IDS.length - 1 : delta ? (i + delta + GROUP_IDS.length) % GROUP_IDS.length : -1;
    if (to < 0) return;
    e.preventDefault();
    heads.current[to]?.focus();
  };

  const group = (id: GroupId, title: string, summary: string, children: ReactNode) => {
    const i = GROUP_IDS.indexOf(id);
    const isOpen = open === id;
    return (
      <section key={id} className={"acc" + (isOpen ? " open" : "")}>
        <h4 className="acc-h">
          <button ref={(el) => { heads.current[i] = el; }} type="button" className="acc-head" id={`head-${id}`}
            aria-expanded={isOpen} aria-controls={isOpen ? `panel-${id}` : undefined} onClick={() => setOpen(isOpen ? null : id)} onKeyDown={onHeadKey(i)}>
            <span className="acc-title">{title}</span>
            {team && (() => { const o = ownerOf(team, id); return <OwnerBadge name={o.player.name} roleId={o.roleId} />; })()}
            <span className="acc-summary">{summary}</span>
            <span className="acc-chevron" aria-hidden="true">{isOpen ? "▾" : "▸"}</span>
          </button>
        </h4>
        {isOpen && <div id={`panel-${id}`} role="region" aria-labelledby={`head-${id}`} className="acc-panel">{children}</div>}
      </section>
    );
  };

  return (
    <div className="design">
      <div className="row between">
        <h2>Design Lab — {scenario.name}</h2>
        <span className="row">
          <Glossary />
          <button onClick={loadPreset}>Load a design that works</button>
          <button onClick={() => go("choose")}>← Change mission</button>
        </span>
      </div>
      <ResourceBars bars={[r.budget, r.mass, r.power, r.dv]} />

      <div className="lab">
        <div className="parts">
          {group("body", "1. Spacecraft body", `${body.name} · ${body.mass} kg · $${body.cost}M`,
            <Choices title="Spacecraft body" items={parts.bodies} selected={design.bodyId} onPick={(id) => setPart("bodyId", id)}
              hideNote stats={(p) => [money(p.cost), weight(p.mass)]} effect={bodyEffect} />)}

          {group("instruments", "2. Science instruments", `${chosen.length ? chosen.join(" + ") : "none"} (${chosen.length} of ${r.slots.max})`,
            <div role="group" aria-label={`Science instruments, pick up to ${r.slots.max}`}>
              <p className="muted small">{`Tick up to ${r.slots.max}. Each one adds science, but also mass, power, cost and data.`}</p>
              {parts.instruments.map((p) => (
                // power and science live on the effect line, so they are not repeated as chips
                <PartOption key={p.id} type="checkbox" group="instruments" name={p.name} note={p.note} tag={instrumentTag(objective, p.id)}
                  checked={design.instrumentIds.includes(p.id)} onPick={() => toggleInstrument(p.id)}
                  stats={[money(p.cost), weight(p.mass)]} effect={instrumentEffect(p)} />
              ))}
            </div>)}

          {group("power", "3. Power", `${power.name} · ${power.mass} kg · $${power.cost}M`,
            <Choices title="Power" items={parts.powerSources} selected={design.powerId} onPick={(id) => setPart("powerId", id)}
              stats={(p) => [money(p.cost), weight(p.mass), `⚡ ${p.powerAt1AU} W near Earth`]}
              effect={(p) => powerEffect(p, scenario)} />)}

          {group("comms", "4. Communication", `${antenna.name} · ${antenna.mass} kg · $${antenna.cost}M`,
            <Choices title="Communication" items={parts.antennas} selected={design.antennaId} onPick={(id) => setPart("antennaId", id)}
              stats={(p) => [money(p.cost), weight(p.mass), `⚡ uses ${p.power} W`]}
              effect={(p) => antennaEffect(p, design, scenario)} />)}

          {group("engine", "5. Engine and fuel", `${engine.name} · ${design.fuelKg.toLocaleString()} kg fuel · $${(engine.cost + design.fuelKg * parts.fuelPricePerKg).toFixed(1)}M`,
            <>
              <Choices title="Engine" items={parts.engines} selected={design.engineId} onPick={(id) => setPart("engineId", id)}
                stats={(p) => [money(p.cost), weight(p.mass), `⛽ Isp ${p.isp} s (higher = less fuel)`]}
                effect={(p) => engineEffect(p, design, scenario, launchMonth, route, plan)} />
              <div className="fuel">
                <div className="row between">
                  <span>{"⛽ Fuel to carry: "}<b>{`${design.fuelKg.toLocaleString()} kg`}</b> <span className="muted">{`· $${(design.fuelKg * parts.fuelPricePerKg).toFixed(1)}M`}</span></span>
                  <button className="fuel-fill" onClick={() => setPart("fuelKg", Math.min(20000, enoughFuel))}>
                    {`✨ Set to enough + ${Math.round((settings.fuelMargin - 1) * 100)}% reserve (${enoughFuel.toLocaleString()} kg)`}
                  </button>
                </div>
                <input type="range" aria-label="Fuel in kg" min={0} max={20000} step={50} value={design.fuelKg} onChange={(e) => setPart("fuelKg", Number(e.target.value))} />
              </div>
            </>)}

          {group("rocket", "6. Rocket", `${rocket.name} · lifts ${rocket.capacity.toLocaleString()} kg · $${rocket.cost}M`,
            <Choices title="Rocket" items={parts.rockets} selected={design.rocketId} onPick={(id) => setPart("rocketId", id)}
              stats={(p) => [money(p.cost), `🚀 lifts ${p.capacity.toLocaleString()} kg`]} effect={rocketEffect} />)}
        </div>

        <aside className="summary">
          <h3>Mission check</h3>
          <p className="plan-line"><span>{`${objective.icon} `}<b>Goal:</b> {objective.name}<br />{`${orbit.icon} `}<b>Orbit:</b> {orbit.name}</span>
            <button className="small-btn" onClick={() => go("plan")}>{PLAN_TEXT.change}</button></p>
          <p><b>Science points:</b> {r.science} <span className="muted">({Math.round(r.comms.fraction * 100)}% of data reaches Earth)</span></p>
          <p><b>Trip time:</b> about {r.tripDays < 60 ? r.tripDays + " days" : Math.round(r.tripDays / 30) + " months"}</p>
          {r.problems.length === 0 ? (
            <div className="ok-box">All checks pass. Ready to launch!</div>
          ) : (
            <ul className="problems">{r.problems.map((p) => <li key={p}>{`⚠ ${p}`}</li>)}</ul>
          )}
          <button className="primary big" disabled={!r.allOk} onClick={() => go("launch")}>Go to launch calendar →</button>
          {/* in team mode the goals need the room once the button is already unlocked */}
          {!(team && r.allOk) && <p className="muted small">This button unlocks when the Mission check list above has no ⚠ problems left.</p>}
          {team && <TeamGoals goals={evaluateGoals(team, scenario.id, r)} compact />}
          <ProvenanceNote />
        </aside>
      </div>
    </div>
  );
}

const money = (m: number) => `💰 $${m}M`;
const weight = (kg: number) => `⚖️ ${kg.toLocaleString()} kg`;

/**
 * A list of radio choices for one part group.
 * `stats` is what the part IS (cost, mass, power) as chips. `effect` is what picking it would DO to this
 * mission, worked out live from the physics, which is the line that teaches.
 */
function Choices<T extends { id: string; name: string; note?: string }>({ title, items, selected, onPick, stats, effect, hideNote = false }:
  { title: string; items: T[]; selected: string; onPick: (id: string) => void; stats: (p: T) => string[]; effect?: (p: T) => string;
    /** when the effect line already says what the note says */ hideNote?: boolean }) {
  return (
    <div role="radiogroup" aria-label={title}>
      {items.map((p) => (
        <PartOption key={p.id} type="radio" group={title} name={p.name} note={hideNote ? undefined : p.note} checked={selected === p.id}
          onPick={() => onPick(p.id)} stats={stats(p)} effect={effect?.(p)} />
      ))}
    </div>
  );
}

/**
 * One part as a card: a tick when chosen, the name and what it is, its numbers as chips, and what it would
 * do here. The real radio or checkbox stays inside for the keyboard and screen readers; the card is its label.
 */
function PartOption({ type, group, name, note, checked, onPick, stats, effect, tag }: {
  type: "radio" | "checkbox"; group: string; name: string; note?: string; checked: boolean;
  onPick: () => void; stats: string[]; effect?: string;
  /** how this part suits the mission goal, e.g. "⭐ Great for your goal" */ tag?: { tone: "good" | "bad"; text: string } | null;
}) {
  return (
    <label className={"item opt " + (checked ? "on" : "")}>
      <input className="sr-only" type={type} name={group} checked={checked} onChange={onPick} />
      <span className={"opt-mark " + type} aria-hidden="true">{checked ? "✓" : ""}</span>
      <span className="opt-body">
        <span className="opt-title"><b>{name}</b>{note && <span className="muted">{` — ${note}`}</span>}</span>
        <span className="opt-stats">{tag && <span className={"affect " + tag.tone}>{tag.text}</span>}{stats.map((s) => <span key={s} className="stat">{s}</span>)}</span>
        {effect && <small className="effect">{`👉 ${effect}`}</small>}
      </span>
    </label>
  );
}
