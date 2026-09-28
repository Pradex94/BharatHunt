"use client";

import { useMemo, useState } from "react";
import { Info } from "lucide-react";

import { cn } from "@/lib/utils";
import { Numeric } from "@/components/ui/typography";
import {
  calculateRaise,
  formatRunway,
  SUGGESTED_RUNWAY_MONTHS,
} from "@/lib/funding/calculator";
import { formatInr } from "@/lib/funding/format";

const RUNWAY_PRESETS = [12, 18, 24];

/**
 * "How much should I raise?"
 *
 * A calculator, not a model. Every output is the founder's own numbers
 * rearranged — runway is cash over burn, the raise is what the plan costs plus
 * a margin minus what is in the bank — and the arithmetic lives in
 * `lib/funding/calculator.ts` where it is unit-tested. The formula is printed
 * under the result, so nothing about the figure is a black box.
 *
 * The disclaimer sits above the result, not in small print beneath it. The
 * money fields start empty rather than pre-filled: pre-filled numbers get left
 * in place and quietly become part of the answer.
 *
 * Nothing typed here leaves the browser — no request, no storage.
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

  const runwayMonths = Number(targetRunway) || 0;
  const ready = result.projectedMonthlyBurn > 0 && runwayMonths > 0;
  const requiredCapital = result.grossRequirement + result.buffer;

  return (
    <section
      aria-labelledby="funding-calculator"
      className="overflow-hidden rounded-3xl border border-border bg-card"
    >
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex flex-col gap-6 p-5 sm:p-8">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold tracking-wide text-primary uppercase">
              Calculator
            </span>
            <h2 id="funding-calculator" className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
              How much should I raise?
            </h2>
            <p className="text-sm leading-relaxed text-body">
              Size a round against the runway it has to buy. All figures in rupees per month unless
              noted. Nothing you enter leaves this page.
            </p>
          </div>

          <fieldset className="flex flex-col gap-4">
            <legend className="mb-3 text-xs font-semibold text-muted">Where you are today</legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                label="Monthly burn"
                hint="Net cash out per month today"
                value={monthlyBurn}
                onChange={setMonthlyBurn}
              />
              <Field
                label="Current cash"
                hint="In the bank right now (total)"
                value={currentCash}
                onChange={setCurrentCash}
              />
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-4">
            <legend className="mb-3 text-xs font-semibold text-muted">What the round pays for</legend>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-ink" id="runway-label">
                Target runway
              </span>
              <div className="flex flex-wrap items-center gap-2" role="group" aria-labelledby="runway-label">
                {RUNWAY_PRESETS.map((months) => (
                  <button
                    key={months}
                    type="button"
                    aria-pressed={runwayMonths === months}
                    onClick={() => setTargetRunway(String(months))}
                    className={cn(
                      "h-10 rounded-lg border px-3 text-sm font-medium transition-colors pointer-coarse:h-11",
                      runwayMonths === months
                        ? "border-primary bg-primary text-white"
                        : "border-border bg-card text-body hover:border-primary/30",
                    )}
                  >
                    {months} mo
                  </button>
                ))}
                <label className="relative flex items-center">
                  <span className="sr-only">Custom target runway in months</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={targetRunway}
                    onChange={(event) => setTargetRunway(event.target.value.replace(/[^\d]/g, "").slice(0, 3))}
                    className="h-10 w-24 rounded-lg border border-border bg-card px-3 pr-10 text-sm text-ink outline-none pointer-coarse:h-11 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/40"
                  />
                  <span className="pointer-events-none absolute right-3 text-xs text-muted-soft">mo</span>
                </label>
              </div>
              <span className="text-[11px] text-muted-soft">
                {SUGGESTED_RUNWAY_MONTHS} months is typical: about a year to build, six months to raise again.
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Hiring budget" hint="New payroll / month" value={hiring} onChange={setHiring} />
              <Field
                label="Marketing budget"
                hint="New marketing / month"
                value={marketing}
                onChange={setMarketing}
              />
              <Field
                label="Other growth budget"
                hint="Other new spend / month"
                value={growth}
                onChange={setGrowth}
              />
            </div>
          </fieldset>
        </div>

        <div className="flex flex-col gap-5 border-t border-border bg-secondary-bg/60 p-5 sm:p-8 lg:border-t-0 lg:border-l">
          <p className="flex items-start gap-2 rounded-xl bg-card p-3 text-xs leading-relaxed text-body">
            <Info className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
            <span>
              <strong className="font-semibold text-ink">This is an estimate, not financial advice.</strong>{" "}
              It rearranges the numbers you entered and assumes nothing about revenue, growth or
              valuation.
            </span>
          </p>

          <div className="flex flex-col gap-1.5" aria-live="polite">
            <span className="text-xs font-medium text-muted">Estimated raise</span>
            {ready ? (
              <Numeric className="text-4xl leading-none font-bold text-primary sm:text-[44px]">
                {formatInr(result.estimatedRaise) ?? "₹0"}
              </Numeric>
            ) : (
              <span className="text-lg font-semibold text-muted-soft">
                Enter a monthly burn to see a figure
              </span>
            )}
          </div>

          <dl className="grid grid-cols-2 gap-2.5">
            <Readout
              label="Current runway"
              value={ready || Number(monthlyBurn) > 0 ? formatRunway(result.currentRunwayMonths) : "—"}
            />
            <Readout
              label="Monthly net burn"
              value={ready ? (formatInr(result.projectedMonthlyBurn) ?? "—") : "—"}
              hint="after new spend"
            />
            <Readout label="Target runway" value={runwayMonths > 0 ? `${runwayMonths} months` : "—"} />
            <Readout
              label="Required capital"
              value={ready ? (formatInr(requiredCapital) ?? "—") : "—"}
              hint="incl. 20% buffer"
            />
          </dl>

          <div className="rounded-xl border border-border bg-card p-3 text-[11px] leading-relaxed text-muted">
            <p className="font-semibold text-body">How this is calculated</p>
            <p className="mt-1">
              <span className="font-medium text-ink">Required capital</span> = (monthly burn + new
              spend) × target runway + 20% buffer for the months a round takes to close.
            </p>
            <p className="mt-1">
              <span className="font-medium text-ink">Estimated raise</span> = required capital −
              current cash.
            </p>
          </div>

          {result.notes.length > 0 && ready && (
            <ul className="flex flex-col gap-2">
              {result.notes.map((note) => (
                <li key={note} className="border-l-2 border-primary/40 pl-3 text-xs leading-relaxed text-body">
                  {note}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function Field({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (next: string) => void;
}) {
  // Echo the typed figure back in lakh/crore: "5000000" is easy to mistype by
  // a zero, "₹50 L" is not.
  const echo = value ? formatInr(Number(value)) : null;

  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-ink">{label}</span>
      <span className="relative flex items-center">
        <span className="pointer-events-none absolute left-3 text-sm text-muted-soft">₹</span>
        <input
          /*
           * `inputMode="numeric"` with `type="text"`, not `type="number"`:
           * mobile Safari's number input accepts "e" and "+", drops values it
           * cannot parse, and adds spinners nobody wants on a rupee figure.
           */
          type="text"
          inputMode="numeric"
          value={value}
          onChange={(event) => onChange(event.target.value.replace(/[^\d]/g, "").slice(0, 13))}
          placeholder="0"
          className="h-11 w-full rounded-lg border border-border bg-card pr-3 pl-7 text-sm text-ink outline-none transition-colors focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/40"
        />
      </span>
      <span className="flex justify-between gap-2 text-[11px]">
        <span className="text-muted-soft">{hint}</span>
        {echo && <Numeric className="font-medium text-body">{echo}</Numeric>}
      </span>
    </label>
  );
}

function Readout({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl bg-card p-3">
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd>
        <Numeric className="text-base font-bold text-ink">{value}</Numeric>
        {hint && <span className="block text-[10px] text-muted-soft">{hint}</span>}
      </dd>
    </div>
  );
}
