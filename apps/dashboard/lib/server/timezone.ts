export const PACIFIC_TIMEZONE = "America/Los_Angeles";

export type WeekWindow = {
  timezone: typeof PACIFIC_TIMEZONE;
  weekStart: Date;
  weekEnd: Date;
};

type TimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function getTimeParts(date: Date, timeZone: string): TimeParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const values: Partial<TimeParts> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type === "year") values.year = Number(part.value);
    if (part.type === "month") values.month = Number(part.value);
    if (part.type === "day") values.day = Number(part.value);
    if (part.type === "hour") values.hour = Number(part.value);
    if (part.type === "minute") values.minute = Number(part.value);
    if (part.type === "second") values.second = Number(part.value);
  }

  return {
    year: values.year ?? 1970,
    month: values.month ?? 1,
    day: values.day ?? 1,
    hour: values.hour ?? 0,
    minute: values.minute ?? 0,
    second: values.second ?? 0,
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = getTimeParts(date, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  return asUtc - date.getTime();
}

function zonedDateTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string
): Date {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const offsetMs = getTimeZoneOffsetMs(utcGuess, timeZone);
  return new Date(utcGuess.getTime() - offsetMs);
}

function shiftUtcDateByDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function getPacificWeekWindow(reference = new Date()): WeekWindow {
  const nowPt = getTimeParts(reference, PACIFIC_TIMEZONE);
  const currentPtDateUtc = new Date(Date.UTC(nowPt.year, nowPt.month - 1, nowPt.day));
  const dayOfWeek = currentPtDateUtc.getUTCDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const weekStartPtDateUtc = shiftUtcDateByDays(currentPtDateUtc, diffToMonday);
  const weekEndPtDateUtc = shiftUtcDateByDays(weekStartPtDateUtc, 7);

  const weekStart = zonedDateTimeToUtc(
    weekStartPtDateUtc.getUTCFullYear(),
    weekStartPtDateUtc.getUTCMonth() + 1,
    weekStartPtDateUtc.getUTCDate(),
    0,
    0,
    0,
    PACIFIC_TIMEZONE
  );

  const weekEnd = zonedDateTimeToUtc(
    weekEndPtDateUtc.getUTCFullYear(),
    weekEndPtDateUtc.getUTCMonth() + 1,
    weekEndPtDateUtc.getUTCDate(),
    0,
    0,
    0,
    PACIFIC_TIMEZONE
  );

  return {
    timezone: PACIFIC_TIMEZONE,
    weekStart,
    weekEnd,
  };
}
