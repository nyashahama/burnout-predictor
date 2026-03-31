export function getTodayString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const MONTH_MAP: Record<string, number> = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
};

export function parseDateString(
  value: string,
  referenceYear: number = new Date().getFullYear(),
): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [year, month, day] = trimmed.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  const [monthName, dayStr] = trimmed.split(" ");
  const month = MONTH_MAP[monthName];
  const day = Number.parseInt(dayStr, 10);
  if (month === undefined || Number.isNaN(day)) {
    return null;
  }

  return new Date(referenceYear, month, day);
}

export function formatDateForDisplay(
  value: string | Date,
  options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" },
): string {
  const date = value instanceof Date ? value : parseDateString(value);
  if (!date || Number.isNaN(date.getTime())) {
    return value instanceof Date ? "" : value;
  }
  return date.toLocaleDateString("en-US", options);
}
