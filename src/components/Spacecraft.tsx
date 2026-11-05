/**
 * The player's own spacecraft, drawn from the design they bought (Stage 12 Part 1).
 *
 * Two views of the same geometry from src/sim/shipLayout.ts:
 *   <ShipSprite>    the small one on the flight map, nose along the direction of travel
 *   <ShipSchematic> a bigger portrait for the challenge card, nose up, one part highlighted
 *
 * Nothing here is a fixed picture. A large bus is a bigger box than a small one, large panels are
 * longer than small ones, a nuclear battery has no panels at all, and every instrument bought adds a
 * sensor box — so the machine on screen is the machine the player built.
 */
import ship from "../data/ship.json";
import { shipLayout, spriteScale, type ShipLayout, type ShipPart, type ShipPiece } from "../sim/shipLayout";
import type { Damage } from "../sim/context";
import type { Design } from "../physics/checks";

/** One part, as the shapes that make it up. The wrapper carries data-part so a challenge can point at it. */
function Piece({ p, hit, aim = false, damage = null }: { p: ShipPiece; hit: boolean; aim?: boolean; damage?: Damage | null }) {
  const shapes = [];
  const left = p.x - p.w / 2;
  const top = p.y - p.h / 2;
  if (p.shape === "dish") {
    shapes.push(<ellipse key="d" className="s-dish" cx={p.x} cy={p.y} rx={p.w / 2} ry={p.h / 2} />);
  } else if (p.shape === "nozzle") {
    // a bell: narrow where it meets the bus, wide at the mouth
    const throat = p.h * 0.24;
    shapes.push(<polygon key="n" className="s-nozzle"
      points={`${p.x + p.w / 2},${throat} ${p.x + p.w / 2},${-throat} ${left},${-p.h / 2} ${left},${p.h / 2}`} />);
  } else {
    shapes.push(<rect key="r" className={`s-${p.shape}`} x={left} y={top} width={p.w} height={p.h}
      rx={p.shape === "bus" ? Math.min(p.w, p.h) * 0.18 : 0} />);
  }
  if (p.shape === "panel") {
    // the join down the middle of the wing, so a panel reads as a panel and not a blue slab
    shapes.push(<line key="j" className="s-join" x1={p.x} y1={top} x2={p.x} y2={top + p.h} />);
  }
  if (p.shape === "rtg") {
    for (let i = 0; i < ship.rtg.fins; i++) {
      const x = left + (p.w * (i + 1)) / (ship.rtg.fins + 1);
      shapes.push(<line key={`f${i}`} className="s-fin" x1={x} y1={top - p.h * 0.3} x2={x} y2={top + p.h * 1.3} />);
    }
  }
  if (p.shape === "grid") {
    // the accelerator grids of an ion thruster: it pushes gently, for months on end
    for (let i = 0; i < ship.engine.ion.grids; i++) {
      const x = left + (p.w * (i + 1)) / (ship.engine.ion.grids + 1);
      shapes.push(<line key={`g${i}`} className="s-grid-line" x1={x} y1={top} x2={x} y2={top + p.h} />);
    }
  }
  // a hole punched through it: the one bit of damage that changes the shape and not just the colour
  if (damage === "dent" && (p.shape === "panel" || p.shape === "sensor")) {
    const out = p.shape === "panel" ? Math.sign(p.y) || 1 : 1;
    const edge = p.y + (out * p.h) / 2;
    const nick = Math.min(p.w, p.h) * 0.3;
    shapes.push(<polygon key="dent" className="s-dent"
      points={`${p.x - nick},${edge} ${p.x + nick},${edge} ${p.x},${edge - out * nick * 1.5}`} />);
  }
  // a dish that is pointing the wrong way is a dish you can see is pointing the wrong way
  const turned = damage === "turned" && (p.shape === "dish" || p.shape === "mast");
  return (
    <g className={"part" + (hit ? " hit" : "") + (aim ? " aim" : "") + (damage ? ` dmg-${damage}` : "")} data-part={p.part}
      data-shape={p.shape} data-id={p.id} data-damage={damage ?? undefined}
      transform={turned ? `rotate(38 ${p.x.toFixed(1)} ${p.y.toFixed(1)})` : undefined}>
      {shapes}
    </g>
  );
}

function Pieces({ layout, highlight, pointing = null, damage = null }: {
  layout: ShipLayout; highlight: ShipPart | null; pointing?: ShipPart | null; damage?: Damage | null;
}) {
  // one rock makes one hole: a dent lands on a single piece, while dust or a power cut covers the lot
  const dented = damage === "dent" ? layout.pieces.findIndex((p) => p.part === highlight) : -1;
  return <>{layout.pieces.map((p, i) => (
    <Piece key={i} p={p} hit={highlight === p.part} aim={pointing === p.part}
      damage={highlight === p.part && (dented < 0 || dented === i) ? damage : null} />
  ))}</>;
}

/**
 * The spacecraft on the flight map. The map rotates it to the heading, so this draws it nose along +x;
 * pass `heading` to rotate it here instead. The scale is fixed for every design, so a ship with large
 * panels really is the bigger dot on the map.
 */
export function ShipSprite({ design, heading }: { design: Design; heading?: number }) {
  const layout = shipLayout(design);
  const turn = heading === undefined ? "" : `rotate(${heading.toFixed(1)}) `;
  return (
    <g className="ship" transform={`${turn}scale(${spriteScale(layout).toFixed(3)})`}>
      <Pieces layout={layout} highlight={null} />
    </g>
  );
}

/**
 * The bigger portrait, nose up, for the challenge card. It is decoration for a screen reader: every
 * option on that card stays a real button with its own words, and the buttons are what the game reads.
 */
export function ShipSchematic({ design, highlight = null, pointing = null, damage = null }: {
  design: Design;
  /** the part the challenge is happening to: marked, and damaged, for as long as the card is open */
  highlight?: ShipPart | null;
  /** the part the option under the mouse or the keyboard would change, ringed rather than marked */
  pointing?: ShipPart | null;
  /** how that part looks while it is going wrong: dusty, dented, dark, or turned the wrong way */
  damage?: Damage | null;
}) {
  const layout = shipLayout(design);
  const box = ship.schematic.box;
  // the portrait fills its panel whatever the design: this is where the parts are read, and how big
  // one spacecraft is next to another is the map's job, not this one's
  const k = (box - 2 * ship.schematic.pad) / Math.max(layout.w, layout.h);
  return (
    <svg className="schematic" viewBox={`0 0 ${box} ${box}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
      <g transform={`translate(${box / 2} ${box / 2}) rotate(-90) scale(${k.toFixed(3)})`}>
        <Pieces layout={layout} highlight={highlight} pointing={pointing} damage={damage} />
      </g>
    </svg>
  );
}
