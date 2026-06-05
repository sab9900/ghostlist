/**
 * Matches the backend DeleteAfterDuration enum.
 * The API accepts the string name (via JsonStringEnumConverter) on write endpoints,
 * but returns the raw integer value in GhostListDto.ttl.
 */
export enum DeleteAfterDuration {
  Immediately = 'Immediately',
  OneHour = 'OneHour',
  SixHours = 'SixHours',
  TwelveHours = 'TwelveHours',
  OneDay = 'OneDay',
  ThreeDays = 'ThreeDays',
  OneWeek = 'OneWeek',
  OneMonth = 'OneMonth',
  ThreeMonths = 'ThreeMonths',
}

/** Maps the integer TTL value (as returned in GhostListDto.ttl) back to the enum name. */
export const TTL_VALUE_TO_ENUM: Readonly<Record<number, DeleteAfterDuration>> = {
  0: DeleteAfterDuration.Immediately,
  1: DeleteAfterDuration.OneHour,
  6: DeleteAfterDuration.SixHours,
  12: DeleteAfterDuration.TwelveHours,
  24: DeleteAfterDuration.OneDay,
  72: DeleteAfterDuration.ThreeDays,
  168: DeleteAfterDuration.OneWeek,
  720: DeleteAfterDuration.OneMonth,
  2160: DeleteAfterDuration.ThreeMonths,
};

export const TTL_LABELS: Readonly<Record<DeleteAfterDuration, string>> = {
  [DeleteAfterDuration.Immediately]: 'Immediately',
  [DeleteAfterDuration.OneHour]: '1 hour',
  [DeleteAfterDuration.SixHours]: '6 hours',
  [DeleteAfterDuration.TwelveHours]: '12 hours',
  [DeleteAfterDuration.OneDay]: '1 day',
  [DeleteAfterDuration.ThreeDays]: '3 days',
  [DeleteAfterDuration.OneWeek]: '1 week',
  [DeleteAfterDuration.OneMonth]: '1 month',
  [DeleteAfterDuration.ThreeMonths]: '3 months',
};
