/**
 * The rules behind Admin → Platform Health: when a background job counts as
 * healthy, late or failing, and when it is next due.
 *
 * Pure and framework-agnostic so `npm test` covers the thresholds. The page
 * that renders them is admin-only; nothing here is ever shown publicly, and
 * error text is passed through for admins only.
 */

export type Health = "ok" | "warn" | "fail" | "unknown";

export type JobAssessment = {
  health: Health;
  /** One short line: why this colour. */
  reason: string;
};

/**
 * How a scheduled job is doing, from its last success and last failure.
 *
 *   fail    — the most recent attempt failed, or nothing succeeded for 3× the interval
 *   warn    — the last success is older than 1.5× the interval, or some sources are failing
 *   ok      — succeeded within the interval (plus slack)
 *   unknown — no run recorded at all
 */
export function assessJob({
  lastSuccessAt,
  lastFailureAt,
  expectedHours,
  failingSources = 0,
  now = new Date(),
}: {
  lastSuccessAt: string | null;
  lastFailureAt?: string | null;
  expectedHours: number;
  failingSources?: number;
  now?: Date;
}): JobAssessment {
  const success = lastSuccessAt ? new Date(lastSuccessAt).getTime() : null;
  const failure = lastFailureAt ? new Date(lastFailureAt).getTime() : null;

  if (success === null && failure === null) return { health: "unknown", reason: "No run recorded yet" };
  if (failure !== null && (success === null || failure > success)) {
    return { health: "fail", reason: "The most recent run failed" };
  }

  const ageHours = (now.getTime() - (success as number)) / 3_600_000;
  if (ageHours > expectedHours * 3) return { health: "fail", reason: `No successful run for ${Math.round(ageHours)} hours` };
  if (ageHours > expectedHours * 1.5) return { health: "warn", reason: "Running late" };
  if (failingSources > 0) {
    return { health: "warn", reason: `${failingSources} source${failingSources === 1 ? "" : "s"} failing` };
  }
  return { health: "ok", reason: "On schedule" };
}

/** The worst of several assessments — for a section header. */
export function worstHealth(values: Health[]): Health {
  for (const level of ["fail", "warn", "unknown", "ok"] as const) if (values.includes(level)) return level;
  return "unknown";
}

/**
 * Next firing of a GitHub Actions cron of the form "M * * * *" (hourly) or
 * "M H * * *" (daily), in UTC — the two shapes .github/workflows uses.
 */
export function nextCronRun(cron: string, now: Date = new Date()): Date | null {
  const [minute, hour, ...rest] = cron.trim().split(/\s+/);
  if (rest.join(" ") !== "* * *" || !/^\d+$/.test(minute)) return null;
  const next = new Date(now);
  next.setUTCSeconds(0, 0);
  next.setUTCMinutes(Number(minute));
  if (hour === "*") {
    if (next <= now) next.setUTCHours(next.getUTCHours() + 1);
    return next;
  }
  if (!/^\d+$/.test(hour)) return null;
  next.setUTCHours(Number(hour));
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

/** The schedules in .github/workflows — keep in step with the `cron:` lines there. */
export const JOB_SCHEDULES = {
  ingest: { cron: "17 2 * * *", label: "Daily at 07:47 IST", expectedHours: 24 },
  daily5: { cron: "23 * * * *", label: "Hourly tick; runs at the time set in admin", expectedHours: 24 },
  intelligence: { cron: "41 * * * *", label: "Hourly", expectedHours: 1 },
} as const;
