export type ISODate = string;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function assertISODate(value: string, fieldName: string): void {
  if (!ISO_DATE_PATTERN.test(value)) {
    throw new Error(`${fieldName} must use YYYY-MM-DD format`);
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(date.valueOf()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new Error(`${fieldName} is not a valid calendar date`);
  }
}

function asDateOnlyUTC(value: string): Date {
  assertISODate(value, "date");
  return new Date(`${value}T00:00:00.000Z`);
}

export function isValidISODate(value: string): boolean {
  try {
    assertISODate(value, "date");
    return true;
  } catch {
    return false;
  }
}

function formatPartsToISO(parts: Intl.DateTimeFormatPart[]): ISODate {
  const values = Object.fromEntries(
    parts
      .filter((part) => ["year", "month", "day"].includes(part.type))
      .map((part) => [part.type, part.value]),
  );

  return `${values.year}-${values.month}-${values.day}`;
}

export function isValidIANATimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
}

export function getMemberLocalDate(
  nowInstant: Date | string,
  ianaTimezone: string,
): ISODate {
  const instant =
    nowInstant instanceof Date ? nowInstant : new Date(nowInstant);

  if (Number.isNaN(instant.valueOf())) {
    throw new Error("nowInstant must be a valid instant");
  }

  if (!isValidIANATimezone(ianaTimezone)) {
    throw new Error(`Invalid IANA timezone: ${ianaTimezone}`);
  }

  return formatPartsToISO(
    new Intl.DateTimeFormat("en-US", {
      timeZone: ianaTimezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(instant),
  );
}

export function getYesterday(localDate: ISODate): ISODate {
  const date = asDateOnlyUTC(localDate);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export function getTomorrow(localDate: ISODate): ISODate {
  const date = asDateOnlyUTC(localDate);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function getDayNumber(
  localDate: ISODate,
  cohortStartDate: ISODate,
): number {
  const date = asDateOnlyUTC(localDate);
  const start = asDateOnlyUTC(cohortStartDate);
  return (
    Math.trunc((date.getTime() - start.getTime()) / (24 * 60 * 60 * 1_000)) + 1
  );
}

export function isEditableDate(
  localDate: ISODate,
  memberLocalDate: ISODate,
  joinLocalDate: ISODate,
  invalidated = false,
): boolean {
  if (invalidated) {
    return false;
  }

  const yesterday = getYesterday(memberLocalDate);
  return (
    localDate >= joinLocalDate &&
    (localDate === memberLocalDate || localDate === yesterday)
  );
}

export function isScoredCalendarDate(
  localDate: ISODate,
  joinLocalDate: ISODate,
  cohortStartDate: ISODate,
): boolean {
  asDateOnlyUTC(localDate);
  asDateOnlyUTC(joinLocalDate);
  asDateOnlyUTC(cohortStartDate);
  return localDate >= joinLocalDate && localDate >= cohortStartDate;
}

export function formatInstantForViewer(
  instant: Date | string,
  viewerTimezone: string,
  options: Intl.DateTimeFormatOptions = {
    dateStyle: "medium",
    timeStyle: "short",
  },
): string {
  const value = instant instanceof Date ? instant : new Date(instant);

  if (Number.isNaN(value.valueOf())) {
    throw new Error("instant must be a valid instant");
  }

  if (!isValidIANATimezone(viewerTimezone)) {
    throw new Error(`Invalid IANA timezone: ${viewerTimezone}`);
  }

  return new Intl.DateTimeFormat("en-US", {
    ...options,
    timeZone: viewerTimezone,
  }).format(value);
}
