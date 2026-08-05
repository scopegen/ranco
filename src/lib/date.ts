const IST = 'Asia/Kolkata'

function ordinal(day: number): string {
  if (day >= 11 && day <= 13) return `${day}th`
  switch (day % 10) {
    case 1:
      return `${day}st`
    case 2:
      return `${day}nd`
    case 3:
      return `${day}rd`
    default:
      return `${day}th`
  }
}

/** "2026-08-05" or a full ISO datetime -> "5th Aug 2026" (always read as IST). */
export function formatDate(iso: string): string {
  const d = new Date(iso)
  const parts = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: IST,
  }).formatToParts(d)
  const day = Number(parts.find((p) => p.type === 'day')!.value)
  const month = parts.find((p) => p.type === 'month')!.value
  const year = parts.find((p) => p.type === 'year')!.value
  return `${ordinal(day)} ${month} ${year}`
}

/** Full ISO datetime -> "5th Aug 2026, 17:03" — 24h, no seconds, always IST. */
export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  const time = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: IST,
  }).format(d)
  return `${formatDate(iso)}, ${time}`
}