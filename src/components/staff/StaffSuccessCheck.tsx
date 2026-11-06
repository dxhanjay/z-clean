/**
 * Animated success check (staff Web3D UI pass) — the "handover
 * recorded" confirmation badge on the task detail page. A circle
 * draws itself, then the tick draws inside it, with a soft pop on
 * the badge. The keyframes live in globals.css
 * (.staff-success-badge / -circle / -check); under
 * prefers-reduced-motion the paths render fully drawn with no
 * animation, so the confirmation reads identically.
 *
 * Pure SVG + CSS — no client JS, no new dependency. `size` is the
 * badge diameter in px (the glyph scales with it); the default 64
 * suits the task-detail done card, smaller values suit inline
 * confirmations like the invite done state.
 */
export default function StaffSuccessCheck({ size = 64 }: { size?: number }) {
  const glyph = Math.round(size * 0.75);
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className="staff-success-badge mx-auto grid place-items-center rounded-full bg-brand-100"
    >
      <svg viewBox="0 0 56 56" style={{ width: glyph, height: glyph }} fill="none">
        <circle
          cx="28"
          cy="28"
          r="26"
          className="staff-success-circle"
          stroke="var(--color-brand-600)"
          strokeWidth="3"
          strokeLinecap="round"
          transform="rotate(-90 28 28)"
        />
        <path
          d="M17 29.5 24.5 37 39 21"
          className="staff-success-check"
          stroke="var(--color-brand-700)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
