/**
 * Short date range for booking UI, e.g. "Apr 27 – May 03" (year omitted if same year as start).
 */
export function formatBatchDateRange(startsAt: Date, endsAt: Date): string {
  const s = new Intl.DateTimeFormat("en-IN", { month: "short", day: "numeric" }).format(startsAt);
  const e = new Intl.DateTimeFormat("en-IN", { month: "short", day: "numeric" }).format(endsAt);
  const y1 = startsAt.getFullYear();
  const y2 = endsAt.getFullYear();
  if (y1 !== y2) {
    const sFull = new Intl.DateTimeFormat("en-IN", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(startsAt);
    const eFull = new Intl.DateTimeFormat("en-IN", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(endsAt);
    return `${sFull} – ${eFull}`;
  }
  return `${s} – ${e}`;
}

const ORDINAL: Record<number, string> = {
  1: "1st",
  2: "2nd",
  3: "3rd",
  4: "4th",
  5: "5th",
  6: "6th",
  7: "7th",
  8: "8th",
  9: "9th",
};

export function gradeToOrdinal(grade: number): string {
  return ORDINAL[grade] ?? `${grade}th`;
}

/** e.g. "After-School Grade 1stA (Apr 27 – May 03)" */
export function buildBookDemoHeading(
  programTitle: string,
  grade: number,
  batchCode: string,
  startsAt: Date,
  endsAt: Date,
): string {
  const g = gradeToOrdinal(grade);
  const range = formatBatchDateRange(startsAt, endsAt);
  const title = programTitle.trim() || "Program";
  return `${title} Grade ${g}${batchCode} (${range})`;
}
