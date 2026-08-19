export type ScheduleOccurrence = {
  key: string;
  startAt: Date;
  endAt: Date;
};

type LocalParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

export function normalizeDays(values: unknown): number[] {
  if (!Array.isArray(values)) return [];

  return Array.from(
    new Set(
      values
        .filter(
          (value): value is number =>
            typeof value === "number" &&
            Number.isInteger(value) &&
            value >= 0 &&
            value <= 6,
        )
        .sort((a, b) => a - b),
    ),
  );
}

function parseDateString(value: string) {
  if (!DATE_RE.test(value)) {
    throw new Error("Dates must use YYYY-MM-DD");
  }

  const [year, month, day] = value
    .split("-")
    .map(Number);

  const probe = new Date(
    Date.UTC(year, month - 1, day),
  );

  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    throw new Error(`Invalid date: ${value}`);
  }

  return { year, month, day };
}

function parseTimeString(value: string) {
  if (!TIME_RE.test(value)) {
    throw new Error("Times must use HH:mm");
  }

  const [hour, minute] = value
    .split(":")
    .map(Number);

  if (
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    throw new Error(`Invalid time: ${value}`);
  }

  return { hour, minute };
}

function getLocalParts(
  date: Date,
  timeZone: string,
): LocalParts {
  const formatter = new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    },
  );

  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

export function assertTimeZone(
  timeZone: string,
) {
  try {
    new Intl.DateTimeFormat("en-US", {
      timeZone,
    }).format(new Date());
  } catch {
    throw new Error(
      `Invalid timezone: ${timeZone}`,
    );
  }
}

export function zonedDateTimeToUtc(
  dateValue: string,
  timeValue: string,
  timeZone: string,
): Date {
  const date = parseDateString(dateValue);
  const time = parseTimeString(timeValue);

  assertTimeZone(timeZone);

  const targetUtcLike = Date.UTC(
    date.year,
    date.month - 1,
    date.day,
    time.hour,
    time.minute,
  );

  let guess = targetUtcLike;

  for (
    let attempt = 0;
    attempt < 4;
    attempt++
  ) {
    const local = getLocalParts(
      new Date(guess),
      timeZone,
    );

    const actualUtcLike = Date.UTC(
      local.year,
      local.month - 1,
      local.day,
      local.hour,
      local.minute,
    );

    const delta =
      targetUtcLike - actualUtcLike;

    if (delta === 0) break;

    guess += delta;
  }

  const result = new Date(guess);

  const finalLocal = getLocalParts(
    result,
    timeZone,
  );

  if (
    finalLocal.year !== date.year ||
    finalLocal.month !== date.month ||
    finalLocal.day !== date.day ||
    finalLocal.hour !== time.hour ||
    finalLocal.minute !== time.minute
  ) {
    throw new Error(
      `Local time ${dateValue} ${timeValue} does not exist in ${timeZone}`,
    );
  }

  return result;
}

export function addCalendarDays(
  dateValue: string,
  amount: number,
): string {
  const { year, month, day } =
    parseDateString(dateValue);

  const date = new Date(
    Date.UTC(
      year,
      month - 1,
      day + amount,
    ),
  );

  return [
    date.getUTCFullYear(),
    String(
      date.getUTCMonth() + 1,
    ).padStart(2, "0"),
    String(
      date.getUTCDate(),
    ).padStart(2, "0"),
  ].join("-");
}

function nominalDayOfWeek(
  dateValue: string,
) {
  const { year, month, day } =
    parseDateString(dateValue);

  return new Date(
    Date.UTC(year, month - 1, day),
  ).getUTCDay();
}

export function buildRecurringOccurrences({
  startDate,
  endDate,
  days,
  startTime,
  endTime,
  timeZone,
}: {
  startDate: string;
  endDate: string;
  days: number[];
  startTime: string;
  endTime: string;
  timeZone: string;
}): ScheduleOccurrence[] {
  parseDateString(startDate);
  parseDateString(endDate);
  parseTimeString(startTime);
  parseTimeString(endTime);
  assertTimeZone(timeZone);

  if (endDate < startDate) {
    throw new Error(
      "Recurrence end date must not precede start date",
    );
  }

  const normalizedDays =
    normalizeDays(days);

  if (!normalizedDays.length) {
    throw new Error(
      "Select at least one recurring weekday",
    );
  }

  const occurrences: ScheduleOccurrence[] =
    [];

  let cursor = startDate;
  let iterations = 0;

  while (cursor <= endDate) {
    iterations += 1;

    if (iterations > 366) {
      throw new Error(
        "Recurring campaigns are currently limited to 366 days",
      );
    }

    if (
      normalizedDays.includes(
        nominalDayOfWeek(cursor),
      )
    ) {
      const startAt =
        zonedDateTimeToUtc(
          cursor,
          startTime,
          timeZone,
        );

      const endDateForOccurrence =
        endTime > startTime
          ? cursor
          : addCalendarDays(
              cursor,
              1,
            );

      const endAt =
        zonedDateTimeToUtc(
          endDateForOccurrence,
          endTime,
          timeZone,
        );

      if (endAt <= startAt) {
        throw new Error(
          "Recurring occurrence must have a positive duration",
        );
      }

      occurrences.push({
        key: cursor,
        startAt,
        endAt,
      });
    }

    cursor = addCalendarDays(
      cursor,
      1,
    );
  }

  if (!occurrences.length) {
    throw new Error(
      "The selected weekdays do not occur inside this date range",
    );
  }

  return occurrences;
}

export function recurringCampaignEnvelope({
  startDate,
  endDate,
  timeZone,
}: {
  startDate: string;
  endDate: string;
  timeZone: string;
}) {
  return {
    startAt: zonedDateTimeToUtc(
      startDate,
      "00:00",
      timeZone,
    ),

    endAt: zonedDateTimeToUtc(
      addCalendarDays(
        endDate,
        1,
      ),
      "00:00",
      timeZone,
    ),
  };
}
