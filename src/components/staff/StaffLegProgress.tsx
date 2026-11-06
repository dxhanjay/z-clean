import { staffLegProgress, staffLegSteps } from "@/lib/motion";

/**
 * Leg progress stepper (staff Web3D UI pass) — the rider's own
 * two steps for this round: Travel → Handover. The RULES for which
 * step is done/current and how full the bar is live in
 * src/lib/motion.ts (§5, unit-tested): awaiting the leg lights
 * Travel; at the leg, Travel is done and Handover is current;
 * after the handover both are done and the bar is full.
 *
 * Server-renderable (no client JS): the fill animates via the
 * .staff-progress-fill width transition when the page state
 * changes, and is instant under prefers-reduced-motion. Status
 * pills transition their colours via Tailwind's transition-colors.
 */
export default function StaffLegProgress({
  leg,
  arrived,
  awaitingThisLeg,
}: {
  leg: "pickup" | "delivery";
  arrived: boolean;
  awaitingThisLeg: boolean;
}) {
  const steps = staffLegSteps({ arrived, awaitingThisLeg });
  const fill = staffLegProgress({ arrived, awaitingThisLeg });
  const handoverLabel = leg === "pickup" ? "Pickup handover" : "Delivery handover";

  return (
    <div
      role="img"
      aria-label={
        arrived
          ? `Round progress: travel and ${handoverLabel.toLowerCase()} complete`
          : awaitingThisLeg
            ? `Round progress: travelling — ${handoverLabel.toLowerCase()} opens when the order reaches this step`
            : `Round progress: travel complete — ${handoverLabel.toLowerCase()} in progress`
      }
    >
      <div className="flex items-center gap-2.5" aria-hidden="true">
        {steps.map((step, i) => (
          <div key={step.id} className="flex items-center gap-2.5">
            {i > 0 && <span className="h-px w-5 bg-mist-300" />}
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-extrabold uppercase tracking-wide transition-colors duration-500 ${
                step.state === "done"
                  ? "bg-brand-600 text-white"
                  : step.state === "current"
                    ? "bg-brand-100 text-brand-800 ring-1 ring-brand-300"
                    : "bg-mist-100 text-ink-500"
              }`}
            >
              {step.state === "done" && (
                <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none">
                  <path
                    d="M2 6.5 4.8 9 10 3"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
              {step.id === "travel" ? "Travel" : handoverLabel}
            </span>
          </div>
        ))}
      </div>
      <div
        aria-hidden="true"
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-mist-200"
      >
        <div
          className="staff-progress-fill h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-600"
          style={{ width: `${Math.round(fill * 100)}%` }}
        />
      </div>
    </div>
  );
}
