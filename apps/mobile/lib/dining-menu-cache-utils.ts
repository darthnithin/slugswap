export function getDiningMenuWindow(startDate: string, days = 8): string[] {
  const [year, month, day] = startDate.split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 1, day, 12));

  return Array.from({ length: days }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() + index);
    return date.toISOString().slice(0, 10);
  });
}

export function isDiningCacheFresh(
  savedAt: string | null | undefined,
  maxAgeMs = 30 * 60 * 1000,
  now = Date.now()
): boolean {
  if (!savedAt) return false;
  const timestamp = Date.parse(savedAt);
  return Number.isFinite(timestamp) && now - timestamp < maxAgeMs;
}
