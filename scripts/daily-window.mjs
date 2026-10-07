// Decides whether an hourly cron run is the one that should send the daily word.

/** Offset of a time zone from UTC at the given instant, in ms. */
function tzOffsetMs(utcMs, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** UTC instant of a wall-clock time in a time zone. */
export function zonedToUtc(year, month, day, hour, minute, timeZone) {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const first = guess - tzOffsetMs(guess, timeZone);
  // Re-check with the offset at the result in case a DST change lies in between.
  return guess - tzOffsetMs(first, timeZone);
}

function localDate(utcMs, timeZone) {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(utcMs))
    .split('-')
    .map(Number);
  return { y, m, d };
}

export const SLOT_MINUTE = 45;
const HOUR = 3_600_000;

/**
 * The workflow runs hourly at :45 UTC, often a few minutes late. Each run owns the
 * hour after its scheduled time, so exactly one run per day finds the target in its
 * window. Returns the target instant (UTC ms) or null when this run isn't the one.
 */
export function targetInWindow(nowMs, time, timeZone) {
  const [hh, mm] = time.split(':').map(Number);
  if (!(hh >= 0 && hh < 24 && mm >= 0 && mm < 60)) throw new Error(`Invalid time "${time}", expected HH:MM`);

  const now = new Date(nowMs);
  let slotStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours(), SLOT_MINUTE);
  if (slotStart > nowMs) slotStart -= HOUR;
  const slotEnd = slotStart + HOUR;

  const today = localDate(nowMs, timeZone);
  for (const dayOffset of [-1, 0, 1]) {
    const base = new Date(Date.UTC(today.y, today.m - 1, today.d + dayOffset));
    const target = zonedToUtc(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate(), hh, mm, timeZone);
    if (target > slotStart && target <= slotEnd) return target;
  }
  return null;
}
