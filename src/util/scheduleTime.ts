import { addDays } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

/** Start of calendar day `ymd` (YYYY-MM-DD) in `timeZone`, as UTC instant. */
export function zonedDayStartUtc(ymd: string, timeZone: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) throw new Error("Invalid ymd");
  return fromZonedTime(new Date(y, m - 1, d, 0, 0, 0, 0), timeZone);
}

/** Exclusive end of calendar day `ymd` in `timeZone`. */
export function zonedDayEndExclusiveUtc(ymd: string, timeZone: string): Date {
  return addDays(zonedDayStartUtc(ymd, timeZone), 1);
}

export function ymdInTz(date: Date, timeZone: string): string {
  return formatInTimeZone(date, timeZone, "yyyy-MM-dd");
}

export function todayYmd(timeZone: string, now = new Date()): string {
  return ymdInTz(now, timeZone);
}

/**
 * Monday 00:00 (inclusive) through the following Monday 00:00 (exclusive) for the ISO week containing `weekAnchorYmd` in `timeZone`.
 */
export function weekRangeUtcFromMondayContaining(
  weekAnchorYmd: string,
  timeZone: string,
): { weekStartUtc: Date; weekEndExclusiveUtc: Date; mondayYmd: string } {
  const dayStart = zonedDayStartUtc(weekAnchorYmd, timeZone);
  const isoDow = Number(formatInTimeZone(dayStart, timeZone, "i"));
  const weekStartUtc = addDays(dayStart, -(isoDow - 1));
  const weekEndExclusiveUtc = addDays(weekStartUtc, 7);
  const mondayYmd = ymdInTz(weekStartUtc, timeZone);
  return { weekStartUtc, weekEndExclusiveUtc, mondayYmd };
}

export function weekdayShortInTz(date: Date, timeZone: string): string {
  return formatInTimeZone(date, timeZone, "EEE");
}

export function dayMonthLabelInTz(date: Date, timeZone: string): string {
  return formatInTimeZone(date, timeZone, "d MMM");
}

export function timeHmInTz(date: Date, timeZone: string): string {
  return formatInTimeZone(date, timeZone, "hh:mm a");
}

export function durationLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h <= 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
