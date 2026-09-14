/**
 * The "griddy surface" under drift.li heroes: a perspective floor whose lines converge
 * toward a vanishing point above the top edge, with rungs bunching up toward the
 * horizon. Stretches to its box; the parent sets size, colour (stroke is currentColor),
 * opacity and any fade mask. Used by the drift.li home (DriftHome) and the /tour landing.
 */
const ROWS = [16, 42, 78, 128, 196];
const COLS = Array.from({ length: 17 }, (_, i) => -400 + i * 100);

export default function PerspectiveGrid() {
  return (
    <svg viewBox="0 0 800 200" preserveAspectRatio="none" aria-hidden style={{ display: "block", width: "100%", height: "100%" }}>
      <g stroke="currentColor" strokeWidth={1} vectorEffect="non-scaling-stroke" fill="none">
        {ROWS.map((y) => (
          <line key={`r${y}`} x1="0" y1={y} x2="800" y2={y} vectorEffect="non-scaling-stroke" />
        ))}
        {COLS.map((x) => (
          <line key={`c${x}`} x1="400" y1="-170" x2={x} y2="200" vectorEffect="non-scaling-stroke" />
        ))}
      </g>
    </svg>
  );
}
