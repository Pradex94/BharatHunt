"use client";

import { useMemo, useState } from "react";
import { Info } from "lucide-react";

import { Numeric } from "@/components/ui/typography";
import {
  calculateRaise,
  formatRunway,
  SUGGESTED_RUNWAY_MONTHS,
} from "@/lib/funding/calculator";
import { formatInr } from "@/lib/funding/format";

/**
 * "How much should I raise?"
 *
 * A calculator, not a model. Every output is the founder's own numbers
 * rearranged — runway is cash over burn, the raise is what the plan costs plus
 * a margin minus what is in the bank — and the arithmetic lives in
 * `lib/funding/calculator.ts` where it is unit-tested.
 *
 * Two design decisions worth stating:
 *
 * The disclaimer is *above* the result, not in small print beneath it. A
 * founder who reads one line of this component should read the one that says it
 * is an estimate.
 *
 * The fields start empty rather than pre-filled with plausible defaults.
 * Pre-filled numbers get left in place and quietly become part of the answer,
 * and an "estimated raise" computed partly from figures the user never entered
 * is exactly the fabricated-data failure the rest of this feature is built to
 * avoid.
 */
export function FundingCalculator() {
  const [monthlyBurn, setMonthlyBurn] = useState("");
  const [currentCash, setCurrentCash] = useState("");
  const [targetRunway, setTargetRunway] = useState(String(SUGGESTED_RUNWAY_MONTHS));
  const [hiring, setHiring] = useState("");
  const [marketing, setMarketing] = useState("");
  const [growth, setGrowth] = useState("");

  const result = useMemo(
    () =>
      calculateRaise({
        monthlyBurn: Number(monthlyBurn) || 0,
        currentCash: Number(currentCash) || 0,
        targetRunwayMonths: Number(targetRunway) || 0,
        hiringBudget: Number(hiring) || 0,
        marketingBudget: Number(marketing) || 0,
        growthBudget: Number(growth) || 0,
      }),
    [monthlyBurn, currentCash, targetRunway, hiring, marketing, growth],
  );

  const ready = result.projectedMonthlyBurn > 0 && Number(targetRunway) > 0;

  return (
    <section
      aria-labelledby="funding-calculator"
      className="grid grid-cols-1 gap-6 rounded-3xl border border-border bg-card p-6 sm:p-8 lg:grid-cols-[1fr_360px]"
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <h2 id="funding-calculator" className="text-2xl font-bold tracking-tight text-ink">
            How much should I raise?
          </h2>
          <p className="text-sm leading-relaxed text-body">
            Size a round against the runway it has to buy. Enter monthly figures in rupees.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Monthly burn"
            hint="Net cash out per month today"
            value={monthlyBurn}
            onChange={setMonthlyBurn}
          />
          <Field
            label="Current cash"
            hint="In the bank right now"
            value={currentCash}
            onChange={setCurrentCash}
          />
          <Field
            label="Target runway"
            hint="Months the round should last"
            value={targetRunway}
            onChange={setTargetRunway}
            suffix="months"
          />
          <Field
            label="Hiring budget"
            hint="Extra payroll per month"
            value={hiring}
            onChange={setHiring}
          />
          <Field
            label="Marketing budget"
            hint="Extra marketing per month"
            value={marketing}
            onChange={setMarketing}
          />
          <Field
            label="Growth budget"
            hint="Other new spend per month"
            value={growth}
            onChange={setGrowth}
          />
        </div>
      </div>

      <div className="flex flex-col gap-4 rounded-2xl bg-secondary-bg p-5">
        <p className="flex items-start gap-2 text-xs leading-relaxed text-body">
          <Info className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
          <span>
            <strong className="font-semibold text-ink">This is an estimate, not financial
            advice.</strong>{" "}
            It rearranges the numbers you entered and assumes nothing about your revenue, growth or
            valuation.
          </span>
        </p>

        <div className="flex flex-col gap-1 border-t border-border pt-4">
          <span className="text-xs font-medium text-muted">Estimated raise</span>
          {ready ? (
            <Numeric className="text-3xl leading-none font-bold text-ink">
              {formatInr(result.estimatedRaise) ?? "₹0"}
            </Numeric>
          ) : (
            <span className="text-lg font-semibold text-muted-soft">
              Enter a burn and a runway
            </span>
          )}
        </div>

        {ready && (
          <dl className="flex flex-col gap-2 text-xs">
            <Readout label="Monthly burn after raise" value={formatInr(result.projectedMonthlyBurn) ?? "—"} />
            <Readout label="Runway it buys" value={formatRunway(result.resultingRunwayMonths)} />
            <Readout label="Runway you have today" value={formatRunway(result.currentRunwayMonths)} />
            <Readout label="Plan cost before buffer" value={formatInr(result.grossRequirement) ?? "—"} />
            <Readout label="Buffer for closing time" value={formatInr(result.buffer) ?? "—"} />
            <Readout label="Suggested runway" value={`${SUGGESTED_RUNWAY_MONTHS} months`} />
          </dl>
        )}

        {result.notes.length > 0 && (
          <ul className="flex flex-col gap-2 border-t border-border pt-3">
            {result.notes.map((note) => (
              <li key={note} className="text-xs leading-relaxed text-muted">
                {note}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function Field({
  label,
  hint,
  value,
  onChange,
  suffix = "₹",
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (next: string) => void;
  suffix?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-ink">{label}</span>
      <span className="relative flex items-center">
        <input
          /*
           * `inputMode="numeric"` with `type="text"`, not `type="number"`.
           * A number input on mobile Safari accepts "e" and "+" happily, drops
           * the value silently when it cannot parse, and adds spinners nobody
           * wants on a rupee figure. The numeric keypad is the part that
           * actually matters on a phone, and this is how to get it alone.
           */
          type="text"
          inputMode="numeric"
          value={value}
          onChange={(event) => onChange(event.target.value.replace(/[^\d]/g, ""))}
          placeholder="0"
          className="h-11 w-full rounded-lg border border-border bg-card px-3 pr-16 text-sm text-ink outline-none transition-colors focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/40"
        />
        <span className="pointer-events-none absolute right-3 text-xs text-muted-soft">
          {suffix}
        </span>
      </span>
      <span className="text-[11px] text-muted-soft">{hint}</span>
    </label>
  );
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="shrink-0">
        <Numeric className="font-semibold text-ink">{value}</Numeric>
      </dd>
    </div>
  );
}
