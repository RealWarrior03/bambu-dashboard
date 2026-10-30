export function formatTemp(v: number | null): string {
  return v === null ? '–' : `${Math.round(v)}°`;
}

export function formatDuration(minutes: number | null): string {
  if (minutes === null || minutes < 0) return '–';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h} h ${m.toString().padStart(2, '0')} min` : `${m} min`;
}

export function formatEta(minutes: number | null, locale: string): string {
  if (minutes === null || minutes <= 0) return '–';
  const eta = new Date(Date.now() + minutes * 60_000);
  const sameDay = eta.toDateString() === new Date().toDateString();
  return eta.toLocaleString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    ...(sameDay ? {} : { weekday: 'short' }),
  });
}

/** "RRGGBBAA" -> CSS color */
export function cssColor(color: string): string {
  if (!/^[0-9A-Fa-f]{6,8}$/.test(color)) return 'transparent';
  return `#${color.slice(0, 6)}${color.length === 8 ? color.slice(6, 8) : ''}`;
}

/** Picks a readable text color for a filament swatch. */
export function textOn(color: string): string {
  const hex = color.slice(0, 6);
  if (hex.length < 6) return 'inherit';
  const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#111' : '#fff';
}

export function isActiveJob(job: string): boolean {
  return job === 'RUNNING' || job === 'PAUSE' || job === 'PREPARE';
}
