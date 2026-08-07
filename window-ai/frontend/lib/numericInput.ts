export type NumericInputValue = number | "";

export function numericInputValue(value: string): NumericInputValue {
  if (value.trim() === "") return "";

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : "";
}

export function isAtLeast(value: NumericInputValue, minimum: number): value is number {
  return value !== "" && Number.isFinite(value) && value >= minimum;
}

export function isBetween(value: NumericInputValue, minimum: number, maximum: number): value is number {
  return value !== "" && Number.isFinite(value) && value >= minimum && value <= maximum;
}
